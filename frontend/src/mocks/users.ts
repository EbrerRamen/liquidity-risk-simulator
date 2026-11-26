/**
 * Mock of /users (TECHNICAL_PLAN §4.3): list, read, create, and PATCH role,
 * name and activation. ADMIN only. Users are never hard-deleted: the audit
 * trail refers to them, so they are deactivated instead.
 */
import { PASSWORD_MIN_LENGTH, type User, type UserCreateInput, type UserFilters, type UserItem, type UserUpdateInput } from "@/api/users";
import { hasRole, ROLE_LABEL, type Role } from "@/app/session";
import { hashPassword } from "./auth";
import { csvIn, type FieldError } from "./crud";
import { audit, commit, db, nextId, nowIso, type UserRecord } from "./db";
import { latency } from "./latency";
import { paginate, problem, requireUser } from "./server";

const BASE = "/api/v1/users";
const ROLES: readonly Role[] = ["VIEWER", "RISK_ANALYST", "ADMIN"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_RANK: Record<Role, number> = { VIEWER: 0, RISK_ANALYST: 1, ADMIN: 2 };

/** A lock that has run out no longer counts. */
const activeLock = (u: UserRecord) => (u.locked_until && Date.parse(u.locked_until) > Date.now() ? u.locked_until : null);

function toItem(u: UserRecord): UserItem {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    is_active: u.is_active,
    failed_login_count: u.failed_login_count,
    locked_until: activeLock(u),
    last_login_at: u.last_login_at,
    version: u.version,
  };
}

const toEntity = (u: UserRecord): User => ({ ...toItem(u), created_at: u.created_at, updated_at: u.updated_at, created_by: u.created_by, updated_by: u.updated_by });

function find(id: string): UserRecord {
  const u = db().users.find((x) => x.id === id);
  if (!u) throw problem(404, "not-found", "Not found", "This user doesn't exist.", {}, `${BASE}/${id}`);
  return u;
}

const invalid = (errors: FieldError[], instance: string) =>
  problem(422, "validation", "Validation failed", errors.map((e) => `${e.field} ${e.message}`).join("; "), { errors }, instance);

const sorters: Record<string, (u: UserRecord) => string | number> = {
  full_name: (u) => u.full_name,
  email: (u) => u.email,
  role: (u) => ROLE_RANK[u.role],
  last_login_at: (u) => u.last_login_at ?? "",
  created_at: (u) => u.created_at,
};

export const usersMock = {
  async list(f: UserFilters) {
    await latency(250, 500);
    requireUser("ADMIN", BASE);
    const q = f.q?.trim().toLowerCase();
    const roles = csvIn(f.role);
    const status = f.status ?? "all";
    const rows = db().users.filter(
      (u) =>
        (!q || u.full_name.toLowerCase().includes(q) || u.email.includes(q)) &&
        (!roles.length || roles.includes(u.role)) &&
        (status === "all" || (status === "active") === u.is_active),
    );
    const page = paginate(rows, f, sorters, [{ field: "full_name", dir: "asc" }], BASE);
    return { ...page, items: page.items.map(toItem) };
  },

  async get(id: string): Promise<User> {
    await latency(150, 350);
    requireUser("ADMIN", `${BASE}/${id}`);
    return toEntity(find(id));
  },

  async create(raw: UserCreateInput): Promise<User> {
    await latency(400, 800);
    const actor = requireUser("ADMIN", BASE);
    const input = { ...raw, email: raw.email.trim().toLowerCase(), full_name: raw.full_name.trim() };
    const errors: FieldError[] = [];
    if (input.full_name.length < 2) errors.push({ field: "full_name", message: "must be at least 2 characters" });
    if (!EMAIL_RE.test(input.email)) errors.push({ field: "email", message: "enter an email address" });
    if (!ROLES.includes(input.role)) errors.push({ field: "role", message: "choose a role" });
    if (typeof input.password !== "string" || input.password.length < PASSWORD_MIN_LENGTH) errors.push({ field: "password", message: `must be at least ${PASSWORD_MIN_LENGTH} characters` });
    if (errors.length) throw invalid(errors, BASE);
    if (db().users.some((u) => u.email === input.email)) {
      throw problem(409, "duplicate", "Already exists", `${input.email} already has an account`, { errors: [{ field: "email", message: "already has an account" }] }, BASE);
    }

    const id = nextId("u");
    const now = nowIso();
    const user: UserRecord = {
      id,
      email: input.email,
      full_name: input.full_name,
      role: input.role,
      is_active: true,
      password_hash: await hashPassword(id, input.password),
      failed_login_count: 0,
      locked_until: null,
      last_login_at: null,
      version: 1,
      created_at: now,
      updated_at: now,
      created_by: actor.name,
      updated_by: actor.name,
    };
    db().users = [...db().users, user];
    audit({ actor, action: "CREATE", entity_type: "user", entity_id: id, summary: `Created ${user.full_name} (${ROLE_LABEL[user.role]})` });
    commit();
    return toEntity(user);
  },

  async update(id: string, patch: UserUpdateInput): Promise<User> {
    await latency(400, 800);
    const instance = `${BASE}/${id}`;
    const actor = requireUser("ADMIN", instance);
    const u = find(id);
    if (patch.version !== u.version) {
      throw problem(409, "conflict", "Changed by someone else", `This user was updated${u.updated_by ? ` by ${u.updated_by}` : ""} after you opened it.`, {}, instance);
    }
    const next = {
      full_name: patch.full_name === undefined ? u.full_name : patch.full_name.trim(),
      role: patch.role ?? u.role,
      is_active: patch.is_active ?? u.is_active,
    };

    const errors: FieldError[] = [];
    if (next.full_name.length < 2) errors.push({ field: "full_name", message: "must be at least 2 characters" });
    if (!ROLES.includes(next.role)) errors.push({ field: "role", message: "choose a role" });
    // Admins can't lock themselves out by accident.
    if (id === actor.id && next.role !== u.role) errors.push({ field: "role", message: "you can't change your own role" });
    if (id === actor.id && !next.is_active) errors.push({ field: "is_active", message: "you can't deactivate your own account" });
    if (errors.length) throw invalid(errors, instance);

    const losesAdmin = u.is_active && u.role === "ADMIN" && (!next.is_active || !hasRole(next.role, "ADMIN"));
    if (losesAdmin && db().users.filter((x) => x.is_active && x.role === "ADMIN").length === 1) {
      throw problem(409, "last-admin", "Last admin", `${u.full_name} is the only active admin. Make someone else an admin first.`, {}, instance);
    }

    const diff: Record<string, [unknown, unknown]> = {};
    for (const k of ["full_name", "role", "is_active"] as const) if (next[k] !== u[k]) diff[k] = [u[k], next[k]];
    if (!Object.keys(diff).length) return toEntity(u);

    let summary = `Updated ${u.full_name}`;
    if (diff.is_active) summary = `${next.is_active ? "Reactivated" : "Deactivated"} ${u.full_name}`;
    else if (diff.role) summary = `Changed ${u.full_name}'s role from ${ROLE_LABEL[u.role]} to ${ROLE_LABEL[next.role]}`;
    Object.assign(u, next);
    // Reactivation starts from a clean sign-in record.
    if (diff.is_active && next.is_active) Object.assign(u, { failed_login_count: 0, locked_until: null });
    u.version += 1;
    u.updated_at = nowIso();
    u.updated_by = actor.name;
    audit({ actor, action: "UPDATE", entity_type: "user", entity_id: id, summary, changes: diff });
    commit();
    return toEntity(u);
  },
};
