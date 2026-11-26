/**
 * Audit log API (TECHNICAL_PLAN §4.3): GET /audit-logs, ADMIN only. The log is
 * append-only and large, so it pages by cursor rather than page number (§4.1).
 */
import { auditLogMock } from "@/mocks/auditLog";

export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", "CANCEL", "SETTLE", "FAIL", "EXPORT", "LOGIN", "LOGIN_FAILED"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  CANCEL: "Cancelled",
  SETTLE: "Settled",
  FAIL: "Failed settlement",
  EXPORT: "Exported",
  LOGIN: "Signed in",
  LOGIN_FAILED: "Sign-in failed",
};

/** Entity types that appear in the trail, with where each record lives in the app. */
export const AUDIT_ENTITY_TYPES: readonly { value: string; label: string; path?: string }[] = [
  { value: "counterparty", label: "Counterparty", path: "/data/counterparties" },
  { value: "deal", label: "MM deal", path: "/data/deals" },
  { value: "cash flow", label: "Cash flow", path: "/data/cash-flows" },
  { value: "funding source", label: "Funding source", path: "/data/funding-sources" },
  { value: "liquid asset", label: "Liquid asset", path: "/data/liquid-assets" },
  { value: "cash account", label: "Cash account", path: "/data/cash-accounts" },
  { value: "currency exposure", label: "Currency exposure", path: "/data/currency-exposures" },
  { value: "fx rate", label: "FX rate" },
  { value: "user", label: "User", path: "/admin/users" },
  { value: "settings", label: "Settings" },
];

export interface AuditEntry {
  id: number;
  occurred_at: string;
  /** Null for actions without a signed-in user, such as a failed sign-in. */
  actor_user_id: string | null;
  actor_name: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  /** One line describing what happened. */
  summary: string;
  /** Field-level diff: `{ field: [before, after] }`. */
  changes: Record<string, [unknown, unknown]> | null;
  request_id: string | null;
  ip_address: string | null;
}

export interface AuditFilters {
  /** Comma-separated user ids. */
  actor?: string;
  /** Comma-separated actions. */
  action?: string;
  /** Comma-separated entity types. */
  entity_type?: string;
  entity_id?: string;
  /** Inclusive dates (YYYY-MM-DD) on `occurred_at`, UTC. */
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/** Cursor page: pass `next_cursor` back as `cursor` for older entries; null at the end. */
export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export const auditLogApi = {
  list: (f: AuditFilters): Promise<CursorPage<AuditEntry>> => auditLogMock.list(f),
};
