/**
 * Session lifecycle (TECHNICAL_PLAN D9, C12):
 *  - the access token lives only in memory (this provider), never in storage;
 *  - on load, POST /auth/refresh uses the httpOnly refresh cookie to restore the session;
 *  - the access token is refreshed shortly before it expires;
 *  - GET /system/info supplies the business date and base currency for the session.
 * The mock* calls are swapped for the typed API client once the backend exists.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { systemApi } from "@/api/system";
import type { SessionUser, SystemInfo } from "@/app/session";
import { mockHasRefreshCookie, mockLogin, mockLogout, mockMe, mockRefresh, type TokenResponse } from "@/mocks/auth";

export type AuthStatus = "restoring" | "signedOut" | "signedIn";

/** Why the user is on the sign-in page; drives the notice shown there. */
export type SignOutReason = "signedOut" | "expired" | null;

interface AuthValue {
  status: AuthStatus;
  user: SessionUser | null;
  system: SystemInfo | null;
  signOutReason: SignOutReason;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-read the user and system info, e.g. after an admin changes the business date. */
  reload: () => Promise<void>;
  /** For the API client: current bearer token, or null. */
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

const REFRESH_MARGIN_S = 60;

/**
 * Refresh tokens rotate on every use, so two concurrent refresh calls would
 * look like token reuse to the server (StrictMode runs effects twice in dev).
 * Concurrent callers share one in-flight request.
 */
let inflightRefresh: Promise<TokenResponse> | null = null;
function refreshOnce(): Promise<TokenResponse> {
  inflightRefresh ??= mockRefresh().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [signOutReason, setSignOutReason] = useState<SignOutReason>(null);
  const token = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clear = useCallback((reason: SignOutReason) => {
    clearTimeout(timer.current);
    token.current = null;
    setUser(null);
    setSystem(null);
    setSignOutReason(reason);
    setStatus("signedOut");
  }, []);

  /** Take a new token, load system info, and schedule the next refresh. */
  const accept = useCallback(
    (res: TokenResponse): Promise<void> => {
      const start = async (r: TokenResponse): Promise<void> => {
        token.current = r.access_token;
        const info = await systemApi.info();
        setUser(r.user);
        setSystem(info);
        setSignOutReason(null);
        setStatus("signedIn");
        clearTimeout(timer.current);
        timer.current = setTimeout(
          () => {
            refreshOnce()
              .then(start)
              .catch(() => clear("expired"));
          },
          Math.max(5, r.expires_in - REFRESH_MARGIN_S) * 1000,
        );
      };
      return start(res);
    },
    [clear],
  );

  // Restore on load. A missing cookie is a normal signed-out start, not an expiry.
  useEffect(() => {
    let cancelled = false;
    const hadSession = mockHasRefreshCookie();
    refreshOnce()
      .then((res) => (cancelled ? undefined : accept(res)))
      .catch(() => {
        if (!cancelled) clear(hadSession ? "expired" : null);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [accept, clear]);

  const login = useCallback(async (email: string, password: string) => {
    await accept(await mockLogin(email, password));
  }, [accept]);

  const reload = useCallback(async () => {
    const [me, info] = await Promise.all([mockMe(), systemApi.info()]);
    setUser(me);
    setSystem(info);
  }, []);

  const logout = useCallback(async () => {
    await mockLogout();
    clear("signedOut");
  }, [clear]);

  const value = useMemo<AuthValue>(
    () => ({ status, user, system, signOutReason, login, logout, reload, getAccessToken: () => token.current }),
    [status, user, system, signOutReason, login, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
