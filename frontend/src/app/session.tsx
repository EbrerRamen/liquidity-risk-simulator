import { useAuth } from "@/auth/AuthProvider";

export type Role = "VIEWER" | "RISK_ANALYST" | "ADMIN";

export const ROLE_LABEL: Record<Role, string> = {
  VIEWER: "Viewer",
  RISK_ANALYST: "Risk analyst",
  ADMIN: "Admin",
};

/** What each role can do, in one line (TECHNICAL_PLAN §4.2). */
export const ROLE_SUMMARY: Record<Role, string> = {
  VIEWER: "Read and export",
  RISK_ANALYST: "Edit data, run stress tests and models",
  ADMIN: "Everything, plus users and settings",
};

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, RISK_ANALYST: 1, ADMIN: 2 };

/** Role hierarchy from TECHNICAL_PLAN §4.2: each role includes the ones below it. */
export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface SystemInfo {
  version: string;
  businessDate: string; // ISO date; the simulation "today" (A8)
  baseCurrency: string;
  synthetic: boolean;
  llmAvailable: boolean;
}

interface SessionValue {
  user: SessionUser;
  system: SystemInfo;
  can: (required: Role) => boolean;
  logout: () => Promise<void>;
}

/** The signed-in session. Only valid inside <RequireAuth>, which guarantees a user. */
export function useSession(): SessionValue {
  const { user, system, logout } = useAuth();
  if (!user || !system) throw new Error("useSession used outside a signed-in area");
  return { user, system, logout, can: (required) => hasRole(user.role, required) };
}
