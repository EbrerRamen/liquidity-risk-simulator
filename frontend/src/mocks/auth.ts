/**
 * Mock of the auth endpoints (TECHNICAL_PLAN §4.2, §4.3): POST /auth/login,
 * POST /auth/refresh, POST /auth/logout, GET /auth/me.
 *
 * Accounts live in the mock database (managed on the Users screen). The real
 * refresh token is an httpOnly, SameSite=Strict cookie the browser script can
 * never read. This mock stands in for it with sessionStorage, so a reload
 * restores the session the same way the real refresh call will.
 * Replaced by the typed API client when the backend exists.
 */
import { ApiError } from "@/api/problem";
import type { SessionUser } from "@/app/session";
import { audit, commit, db, nowIso, type UserRecord } from "./db";
import { latency, mockRequestId } from "./latency";
import { SEED_USERS } from "./seed";

/** Every seeded account uses this password (min length 12, per §4.2). */
export const DEMO_PASSWORD = "synthetic-demo-2026";

/** The accounts offered on the sign-in page, one per role. */
export const DEMO_ACCOUNTS: SessionUser[] = ["u-viewer", "u-analyst", "u-admin"].map((id) => {
  const u = SEED_USERS.find((x) => x.id === id)!;
  return { id: u.id, name: u.full_name, email: u.email, role: u.role };
});

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_KEY = "lrs.mock.refresh-cookie";

/**
 * Failed attempts for emails with no account. Counting them too means a
 * lockout can't be used to tell which emails exist.
 */
const unknownFailures = new Map<string, { count: number; lockedUntil?: number }>();

interface MockCookie {
  userId: string;
  expiresAt: number;
}

function readCookie(): MockCookie | null {
  try {
    const raw = sessionStorage.getItem(COOKIE_KEY);
    return raw ? (JSON.parse(raw) as MockCookie) : null;
  } catch {
    return null;
  }
}

function writeCookie(cookie: MockCookie | null): void {
  try {
    if (cookie) sessionStorage.setItem(COOKIE_KEY, JSON.stringify(cookie));
    else sessionStorage.removeItem(COOKIE_KEY);
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

function publicUser(u: UserRecord): SessionUser {
  return { id: u.id, name: u.full_name, email: u.email, role: u.role };
}

/**
 * Stand-in for argon2id (§4.2): SHA-256 of the user id and password. Good
 * enough to keep plain passwords out of the mock store; never a real hash.
 */
export async function hashPassword(userId: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${password}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function passwordMatches(u: UserRecord, password: string): Promise<boolean> {
  return u.password_hash === null ? password === DEMO_PASSWORD : u.password_hash === (await hashPassword(u.id, password));
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: SessionUser;
}

function issue(u: UserRecord): TokenResponse {
  writeCookie({ userId: u.id, expiresAt: Date.now() + REFRESH_TTL_MS });
  return { access_token: `mock.${crypto.randomUUID()}`, token_type: "bearer", expires_in: 900, user: publicUser(u) };
}

const loginProblem = (type: string, title: string, status: number, detail: string, extra: Record<string, string> = {}) =>
  new ApiError({ type: `https://lrs.local/problems/${type}`, title, status, detail, instance: "/api/v1/auth/login", request_id: mockRequestId(), ...extra });

const lockedProblem = (lockedUntil: number) =>
  loginProblem("account-locked", "Account locked", 423, `Too many failed sign-in attempts. Try again after ${LOCK_MINUTES} minutes.`, { locked_until: new Date(lockedUntil).toISOString() });

export async function mockLogin(email: string, password: string): Promise<TokenResponse> {
  await latency(500, 900);
  const key = email.trim().toLowerCase();
  const user = db().users.find((u) => u.email === key);
  const unknown = unknownFailures.get(key);
  const lockedUntil = user ? (user.locked_until ? Date.parse(user.locked_until) : 0) : (unknown?.lockedUntil ?? 0);
  if (lockedUntil > Date.now()) throw lockedProblem(lockedUntil);

  if (!user || !(await passwordMatches(user, password))) {
    const count = (user ? user.failed_login_count : (unknown?.count ?? 0)) + 1;
    const lockAt = count >= MAX_ATTEMPTS ? Date.now() + LOCK_MINUTES * 60_000 : undefined;
    if (user) {
      user.failed_login_count = lockAt ? 0 : count;
      user.locked_until = lockAt ? new Date(lockAt).toISOString() : null;
    } else {
      unknownFailures.set(key, { count: lockAt ? 0 : count, lockedUntil: lockAt });
    }
    audit({
      actor: null,
      action: "LOGIN_FAILED",
      entity_type: "user",
      entity_id: user?.id ?? null,
      summary: lockAt ? `Failed sign-in for ${key}; locked for ${LOCK_MINUTES} minutes after ${MAX_ATTEMPTS} attempts` : `Failed sign-in for ${key}`,
    });
    commit();
    // The attempt that triggers the lock reports the lock, not just "incorrect".
    if (lockAt) throw lockedProblem(lockAt);
    throw loginProblem("invalid-credentials", "Invalid credentials", 401, "The email or password is incorrect.");
  }

  if (!user.is_active) {
    audit({ actor: null, action: "LOGIN_FAILED", entity_type: "user", entity_id: user.id, summary: `Sign-in refused for ${key}: account deactivated` });
    commit();
    throw loginProblem("account-inactive", "Account deactivated", 403, "This account has been deactivated. Contact an administrator.");
  }

  user.failed_login_count = 0;
  user.locked_until = null;
  user.last_login_at = nowIso();
  audit({ actor: publicUser(user), action: "LOGIN", entity_type: "user", entity_id: user.id, summary: `Signed in as ${key}` });
  commit();
  return issue(user);
}

/** The signed-in, still active account behind the refresh cookie, if any. */
function cookieUser(): UserRecord | null {
  const cookie = readCookie();
  if (!cookie || cookie.expiresAt < Date.now()) return null;
  return db().users.find((u) => u.id === cookie.userId && u.is_active) ?? null;
}

/** POST /auth/refresh: rotate the refresh cookie and issue a new access token. */
export async function mockRefresh(): Promise<TokenResponse> {
  await latency(300, 600);
  const cookie = readCookie();
  const user = cookieUser();
  if (!user) {
    writeCookie(null);
    throw new ApiError({
      type: "https://lrs.local/problems/unauthenticated",
      title: "Not signed in",
      status: 401,
      detail: cookie ? "The session has expired." : "No session.",
      instance: "/api/v1/auth/refresh",
      request_id: mockRequestId(),
    });
  }
  return issue(user);
}

/** GET /auth/me: the current user, with any name or role change since sign-in. */
export async function mockMe(): Promise<SessionUser> {
  await latency(80, 180);
  const user = cookieUser();
  if (!user) {
    throw new ApiError({ type: "https://lrs.local/problems/unauthenticated", title: "Not signed in", status: 401, detail: "Sign in to continue.", instance: "/api/v1/auth/me", request_id: mockRequestId() });
  }
  return publicUser(user);
}

/**
 * The caller of a mock endpoint, resolved from the session, as the real
 * backend resolves it from the bearer token. Null when signed out. A
 * deactivated account loses access at once, as revoked sessions do.
 */
export function mockCurrentUser(): SessionUser | null {
  const user = cookieUser();
  return user ? publicUser(user) : null;
}

/** Whether a refresh cookie exists. The real app can't see an httpOnly cookie, so it just calls refresh. */
export function mockHasRefreshCookie(): boolean {
  return readCookie() !== null;
}

export async function mockLogout(): Promise<void> {
  await latency(150, 300);
  writeCookie(null);
}
