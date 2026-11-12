/**
 * Mock data standing in for GET /auth/me and GET /system/info until the
 * backend exists (Phase 2). Shapes follow TECHNICAL_PLAN §4.3.
 */
import type { Role, SessionUser, SystemInfo } from "@/app/session";

export const MOCK_SYSTEM_INFO: SystemInfo = {
  version: "0.1.0",
  businessDate: "2026-11-12",
  baseCurrency: "USD",
  synthetic: true,
  llmAvailable: false,
};

export const MOCK_USERS: Record<Role, SessionUser> = {
  VIEWER: { id: "u-viewer", name: "Sam Viewer", email: "viewer@lrs.local", role: "VIEWER" },
  RISK_ANALYST: { id: "u-analyst", name: "Riley Analyst", email: "analyst@lrs.local", role: "RISK_ANALYST" },
  ADMIN: { id: "u-admin", name: "Alex Admin", email: "admin@lrs.local", role: "ADMIN" },
};
