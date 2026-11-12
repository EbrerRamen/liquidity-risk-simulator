import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { MOCK_SYSTEM_INFO, MOCK_USERS } from "@/mocks/session";

export type Role = "VIEWER" | "RISK_ANALYST" | "ADMIN";

export const ROLE_LABEL: Record<Role, string> = {
  VIEWER: "Viewer",
  RISK_ANALYST: "Risk analyst",
  ADMIN: "Admin",
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
  /** Mock only: switch role to preview role-aware UI. Replaced by real auth in M3.2. */
  previewRole: (role: Role) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("RISK_ANALYST");
  const value = useMemo<SessionValue>(() => {
    const user = MOCK_USERS[role];
    return {
      user,
      system: MOCK_SYSTEM_INFO,
      can: (required) => hasRole(user.role, required),
      previewRole: setRole,
    };
  }, [role]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
