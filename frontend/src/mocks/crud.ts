/**
 * Generic mock CRUD endpoints for one resource (TECHNICAL_PLAN §4.3):
 * GET /R (filter, search, sort, paginate), GET /R/{id}, POST /R,
 * PATCH /R/{id} (with version), DELETE /R/{id} (409 if in use), GET /R/export.csv.
 * Every write is role-checked and audited, as the real services will be.
 */
import type { Page, SortSpec } from "@/api/types";
import type { Role, SessionUser } from "@/app/session";
import { audit, businessDate, commit, nextId, nowIso } from "./db";
import { latency } from "./latency";
import { paginate, problem, requireUser, sortRows, toCsv, type ListQuery } from "./server";

export interface FieldError {
  field: string;
  message: string;
}

type CsvCell = string | number | boolean | null;

interface Row {
  id: string;
  version: number;
  updated_at?: string;
  updated_by?: string | null;
}

export interface CrudConfig<R extends Row, F extends ListQuery, Item, Ent, In extends object> {
  base: string;
  /** Singular noun for messages and the audit trail, e.g. "funding source". */
  entity: string;
  idPrefix: string;
  table: () => R[];
  setTable: (rows: R[]) => void;
  label: (r: R) => string;
  filter: (rows: R[], f: F) => R[];
  sorters: Record<string, (r: R) => string | number>;
  defaultSort: SortSpec[] | ((f: F) => SortSpec[]);
  toItem: (r: R) => Item;
  toEntity: (r: R) => Ent;
  /** Editable fields (shared names between input and record). */
  editable: readonly (keyof In & keyof R & string)[];
  /** Clean up input before validation (trim, derived fields such as deposit balances). */
  normalize?: (input: Partial<In>, existing: R | null) => Partial<In>;
  /** Validate the full record as it would be after the write. */
  validate: (input: In, existing: R | null) => FieldError[];
  /** Uniqueness checks: returned errors become a 409 with field errors. */
  duplicates?: (input: In, existing: R | null) => FieldError[];
  build: (input: In, ctx: { id: string; user: SessionUser; now: string }) => R;
  /** Throw a problem to refuse an update (e.g. locked after settlement). */
  beforeUpdate?: (r: R, patch: Partial<In>) => void;
  /** Reason the record can't be deleted, or null. */
  inUse?: (r: R) => string | null;
  writeRole?: Role;
  deleteRole?: Role;
  csv: { name: string; header: string[]; row: (r: R) => CsvCell[] };
}

export function crud<R extends Row, F extends ListQuery, Item, Ent, In extends object>(cfg: CrudConfig<R, F, Item, Ent, In>) {
  const find = (id: string) => {
    const r = cfg.table().find((x) => x.id === id);
    if (!r) throw problem(404, "not-found", "Not found", `This ${cfg.entity} doesn't exist or was deleted.`, {}, `${cfg.base}/${id}`);
    return r;
  };
  const defaults = (f: F) => (typeof cfg.defaultSort === "function" ? cfg.defaultSort(f) : cfg.defaultSort);

  const check = (input: In, existing: R | null, instance: string) => {
    const errors = cfg.validate(input, existing);
    if (errors.length) throw problem(422, "validation", "Validation failed", errors.map((e) => `${e.field} ${e.message}`).join("; "), { errors }, instance);
    const dups = cfg.duplicates?.(input, existing) ?? [];
    if (dups.length) throw problem(409, "duplicate", "Already exists", dups[0]!.message, { errors: dups }, instance);
  };

  return {
    find,

    async list(f: F): Promise<Page<Item>> {
      await latency(250, 550);
      requireUser("VIEWER", cfg.base);
      const page = paginate(cfg.filter(cfg.table(), f), f, cfg.sorters, defaults(f), cfg.base);
      return { ...page, items: page.items.map(cfg.toItem) };
    },

    async get(id: string): Promise<Ent> {
      await latency(200, 400);
      requireUser("VIEWER", `${cfg.base}/${id}`);
      return cfg.toEntity(find(id));
    },

    async create(raw: In): Promise<Ent> {
      await latency(400, 800);
      const user = requireUser(cfg.writeRole ?? "RISK_ANALYST", cfg.base);
      const input = { ...raw, ...(cfg.normalize?.(raw, null) ?? {}) } as In;
      check(input, null, cfg.base);
      const r = cfg.build(input, { id: nextId(cfg.idPrefix), user, now: nowIso() });
      cfg.setTable([...cfg.table(), r]);
      audit({ actor: user, action: "CREATE", entity_type: cfg.entity, entity_id: r.id, summary: `Created ${cfg.label(r)}` });
      commit();
      return cfg.toEntity(r);
    },

    async update(id: string, patch: Partial<In> & { version: number }): Promise<Ent> {
      await latency(400, 800);
      const instance = `${cfg.base}/${id}`;
      const user = requireUser(cfg.writeRole ?? "RISK_ANALYST", instance);
      const r = find(id);
      if (patch.version !== r.version) {
        throw problem(409, "conflict", "Changed by someone else", `This ${cfg.entity} was updated${r.updated_by ? ` by ${r.updated_by}` : ""} after you opened it.`, {}, instance);
      }
      const { version: _v, ...changes } = patch;
      cfg.beforeUpdate?.(r, changes as Partial<In>);
      // Validate the record as it would be after the update (cross-field rules).
      const current = Object.fromEntries(cfg.editable.map((k) => [k, r[k]])) as unknown as In;
      let merged = { ...current, ...changes } as In;
      merged = { ...merged, ...(cfg.normalize?.(merged, r) ?? {}) };
      check(merged, r, instance);

      const diff: Record<string, [unknown, unknown]> = {};
      for (const k of cfg.editable) {
        const next = (merged as Record<string, unknown>)[k];
        if (next !== undefined && next !== r[k]) {
          diff[k] = [r[k], next];
          (r as Record<string, unknown>)[k] = next;
        }
      }
      if (Object.keys(diff).length) {
        r.version += 1;
        r.updated_at = nowIso();
        r.updated_by = user.name;
        audit({ actor: user, action: "UPDATE", entity_type: cfg.entity, entity_id: r.id, summary: `Updated ${cfg.label(r)}`, changes: diff });
        commit();
      }
      return cfg.toEntity(r);
    },

    async remove(id: string, version: number): Promise<void> {
      await latency(400, 700);
      const instance = `${cfg.base}/${id}`;
      const user = requireUser(cfg.deleteRole ?? "ADMIN", instance);
      const r = find(id);
      if (version !== r.version) throw problem(409, "conflict", "Changed by someone else", "Reload and try again.", {}, instance);
      const reason = cfg.inUse?.(r);
      if (reason) throw problem(409, "in-use", "Still in use", reason, {}, instance);
      cfg.setTable(cfg.table().filter((x) => x.id !== id));
      audit({ actor: user, action: "DELETE", entity_type: cfg.entity, entity_id: id, summary: `Deleted ${cfg.label(r)}` });
      commit();
    },

    async exportCsv(f: F): Promise<{ filename: string; csv: string; rows: number }> {
      await latency(500, 900);
      const user = requireUser("VIEWER", `${cfg.base}/export.csv`);
      // Same filters and sort as the list, not paged: the file holds every matching row.
      const rows = sortRows(cfg.filter(cfg.table(), f), f.sort, cfg.sorters, defaults(f), `${cfg.base}/export.csv`);
      const csv = toCsv(cfg.csv.header, rows.map(cfg.csv.row));
      audit({ actor: user, action: "EXPORT", entity_type: cfg.entity, entity_id: null, summary: `Exported ${rows.length} rows (CSV)` });
      commit();
      return { filename: `${cfg.csv.name}_${businessDate()}.csv`, csv, rows: rows.length };
    },
  };
}

/* ---------- small validation helpers shared by resources ---------- */

export const isDec = (v: unknown): v is string => typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v);
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function decimalPlaces(v: string): number {
  return v.includes(".") ? v.split(".")[1]!.length : 0;
}

export function csvIn(raw: string | undefined): string[] {
  return raw ? raw.split(",").filter(Boolean) : [];
}

export function inRange(date: string, from?: string, to?: string): boolean {
  return (!from || date >= from) && (!to || date <= to);
}
