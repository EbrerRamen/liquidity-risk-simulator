/**
 * Mock of the auth endpoints (TECHNICAL_PLAN §4.2, §4.3): POST /auth/login,
 * POST /auth/refresh, POST /auth/logout, GET /auth/me.
 *
 * The real refresh token is an httpOnly, SameSite=Strict cookie the browser
 * script can never read. This mock stands in for it with sessionStorage, so a
 * reload restores the session the same way the real refresh call will.
 * Replaced by the typed API client when the backend exists.
 */
import { ApiError } from "@/api/problem";
import type { SessionUser } from "@/app/session";
import { latency, mockRequestId } from "./latency";

/** Every demo account uses this password (min length 12, per §4.2). */
export const DEMO_PASSWORD = "synthetic-demo-2026";

interface MockAccount extends SessionUser {
  active: boolean;
}

const ACCOUNTS: MockAccount[] = [
  { id: "u-viewer", name: "Sam Viewer", email: "viewer@lrs.local", role: "VIEWER", active: true },
  { id: "u-analyst", name: "Riley Analyst", email: "analyst@lrs.local", role: "RISK_ANALYST", active: true },
  { id: "u-admin", name: "Alex Admin", email: "admin@lrs.local", role: "ADMIN", active: true },
  { id: "u-former", name: "Former Analyst", email: "former@lrs.local", role: "RISK_ANALYST", active: false },
];

export const DEMO_ACCOUNTS = ACCOUNTS.filter((a) => a.active).map(({ active: _active, ...user }) => user);

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_KEY = "lrs.mock.refresh-cookie";

const failures = new Map<string, { count: number; lockedUntil?: number }>();

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

function publicUser(a: MockAccount): SessionUser {
  return { id: a.id, name: a.name, email: a.email, role: a.role };
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: SessionUser;
}

function issue(account: MockAccount): TokenResponse {
  writeCookie({ userId: account.id, expiresAt: Date.now() + REFRESH_TTL_MS });
  return { access_token: `mock.${crypto.randomUUID()}`, token_type: "bearer", expires_in: 900, user: publicUser(account) };
}

export async function mockLogin(email: string, password: string): Promise<TokenResponse> {
  await latency(500, 900);
  const key = email.trim().toLowerCase();
  const state = failures.get(key);

  const lockedProblem = (lockedUntil: number) =>
    new ApiError({
      type: "https://lrs.local/problems/account-locked",
      title: "Account locked",
      status: 423,
      detail: `Too many failed sign-in attempts. Try again after ${LOCK_MINUTES} minutes.`,
      instance: "/api/v1/auth/login",
      request_id: mockRequestId(),
      locked_until: new Date(lockedUntil).toISOString(),
    });

  if (state?.lockedUntil && state.lockedUntil > Date.now()) throw lockedProblem(state.lockedUntil);

  const account = ACCOUNTS.find((a) => a.email === key);
  if (!account || password !== DEMO_PASSWORD) {
    const count = (state?.count ?? 0) + 1;
    const lockedUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCK_MINUTES * 60_000 : undefined;
    failures.set(key, { count: lockedUntil ? 0 : count, lockedUntil });
    // The attempt that triggers the lock reports the lock, not just "incorrect".
    if (lockedUntil) throw lockedProblem(lockedUntil);
    throw new ApiError({
      type: "https://lrs.local/problems/invalid-credentials",
      title: "Invalid credentials",
      status: 401,
      detail: "The email or password is incorrect.",
      instance: "/api/v1/auth/login",
      request_id: mockRequestId(),
    });
  }

  if (!account.active) {
    throw new ApiError({
      type: "https://lrs.local/problems/account-inactive",
      title: "Account deactivated",
      status: 403,
      detail: "This account has been deactivated. Contact an administrator.",
      instance: "/api/v1/auth/login",
      request_id: mockRequestId(),
    });
  }

  failures.delete(key);
  return issue(account);
}

/** POST /auth/refresh: rotate the refresh cookie and issue a new access token. */
export async function mockRefresh(): Promise<TokenResponse> {
  await latency(300, 600);
  const cookie = readCookie();
  const account = cookie && ACCOUNTS.find((a) => a.id === cookie.userId && a.active);
  if (!cookie || !account || cookie.expiresAt < Date.now()) {
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
  return issue(account);
}

/** Whether a refresh cookie exists. The real app can't see an httpOnly cookie, so it just calls refresh. */
export function mockHasRefreshCookie(): boolean {
  return readCookie() !== null;
}

export async function mockLogout(): Promise<void> {
  await latency(150, 300);
  writeCookie(null);
}
