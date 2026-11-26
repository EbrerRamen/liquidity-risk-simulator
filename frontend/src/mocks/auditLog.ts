/** Mock of GET /audit-logs (TECHNICAL_PLAN §4.3): newest first, filtered, cursor-paginated (§4.1). */
import type { AuditEntry, AuditFilters, CursorPage } from "@/api/auditLog";
import { csvIn } from "./crud";
import { db, type AuditRecord } from "./db";
import { latency } from "./latency";
import { problem, requireUser } from "./server";

const BASE = "/api/v1/audit-logs";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const toEntry = (r: AuditRecord): AuditEntry => ({ ...r, changes: r.changes ?? null });

export const auditLogMock = {
  async list(f: AuditFilters): Promise<CursorPage<AuditEntry>> {
    await latency(250, 550);
    requireUser("ADMIN", BASE);
    const cursor = f.cursor === undefined ? null : Number(f.cursor);
    if (cursor !== null && !Number.isInteger(cursor)) {
      throw problem(422, "validation", "Validation failed", "The cursor is not valid.", { errors: [{ field: "cursor", message: "not a valid cursor" }] }, BASE);
    }
    const limit = Math.min(Math.max(1, f.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const actors = csvIn(f.actor);
    const actions = csvIn(f.action);
    const types = csvIn(f.entity_type);
    const rows = db().audit.filter((r) => {
      const day = r.occurred_at.slice(0, 10);
      return (
        (cursor === null || r.id < cursor) &&
        (!actors.length || (r.actor_user_id !== null && actors.includes(r.actor_user_id))) &&
        (!actions.length || actions.includes(r.action)) &&
        (!types.length || types.includes(r.entity_type)) &&
        (!f.entity_id || r.entity_id === f.entity_id) &&
        (!f.from || day >= f.from) &&
        (!f.to || day <= f.to)
      );
    });
    // The store is newest first (ids only grow), so the page is a prefix.
    const items = rows.slice(0, limit).map(toEntry);
    return { items, next_cursor: rows.length > limit ? String(items[items.length - 1]!.id) : null };
  },
};
