/**
 * Mock of the counterparty endpoints (TECHNICAL_PLAN §4.3):
 * GET/POST /counterparties, GET/PATCH/DELETE /counterparties/{id},
 * GET /counterparties/{id}/summary, GET /counterparties/{id}/rating-history,
 * GET /counterparties/export.csv.
 */
import type {
  Counterparty,
  CounterpartyFilters,
  CounterpartyInput,
  CounterpartyListItem,
  CounterpartyPatch,
  CounterpartySummary,
  RatingHistoryItem,
} from "@/api/counterparties";
import type { Page } from "@/api/types";
import { BASE_CCY, BUSINESS_DATE } from "./dashboard-data";
import { audit, commit, db, nextId, nowIso, type CounterpartyRecord } from "./db";
import { latency } from "./latency";
import { BANDS, COUNTERPARTY_TYPES, COUNTRIES, RATINGS, type Band } from "./reference";
import { csvList, paginate, problem, requireUser, sortRows, toCsv } from "./server";

const BASE = "/api/v1/counterparties";
const money = (n: number) => n.toFixed(2);
const bandRank = (b: Band | null) => (b === null ? -1 : BANDS.indexOf(b));

function toItem(c: CounterpartyRecord): CounterpartyListItem {
  return {
    id: c.id,
    name: c.name,
    counterparty_type: c.counterparty_type,
    country_code: c.country_code,
    credit_rating: c.credit_rating,
    risk_classification: c.risk_classification,
    is_active: c.is_active,
    latest_assessment: c.model_band ? { band: c.model_band, score: c.model_score!, as_of: c.assessed_at! } : null,
    exposure: { funding: money(c.funding), credit: money(c.credit), currency: BASE_CCY },
    open_deals: c.open_deals,
    updated_at: c.updated_at,
    version: c.version,
  };
}

function toEntity(c: CounterpartyRecord): Counterparty {
  return {
    id: c.id,
    name: c.name,
    counterparty_type: c.counterparty_type,
    country_code: c.country_code,
    credit_rating: c.credit_rating,
    risk_classification: c.risk_classification,
    is_active: c.is_active,
    is_synthetic: c.is_synthetic,
    version: c.version,
    created_at: c.created_at,
    updated_at: c.updated_at,
    created_by: c.created_by,
    updated_by: c.updated_by,
  };
}

function find(id: string): CounterpartyRecord {
  const c = db().counterparties.find((x) => x.id === id);
  if (!c) throw problem(404, "not-found", "Not found", "This counterparty doesn't exist or was deleted.", {}, `${BASE}/${id}`);
  return c;
}

function filtered(f: CounterpartyFilters): CounterpartyRecord[] {
  const q = f.q?.trim().toLowerCase();
  const types = csvList(f.counterparty_type);
  const countries = csvList(f.country_code);
  const risks = csvList(f.risk_classification);
  const models = csvList(f.model_band);
  return db().counterparties.filter(
    (c) =>
      (!q || c.name.toLowerCase().includes(q) || c.id.toLowerCase() === q) &&
      (!f.id || c.id === f.id) &&
      (!types.length || types.includes(c.counterparty_type)) &&
      (!countries.length || countries.includes(c.country_code)) &&
      (!risks.length || risks.includes(c.risk_classification)) &&
      (!models.length || (c.model_band !== null && models.includes(c.model_band))) &&
      (f.status === "all" || (f.status === "inactive" ? !c.is_active : c.is_active)) &&
      (!f.disagreement || (c.model_band !== null && c.model_band !== c.risk_classification)),
  );
}

const SORTERS: Record<string, (c: CounterpartyRecord) => string | number> = {
  name: (c) => c.name,
  counterparty_type: (c) => c.counterparty_type,
  country_code: (c) => c.country_code,
  credit_rating: (c) => RATINGS.indexOf(c.credit_rating),
  risk_classification: (c) => bandRank(c.risk_classification),
  model_band: (c) => bandRank(c.model_band),
  funding: (c) => c.funding,
  credit: (c) => c.credit,
  open_deals: (c) => c.open_deals,
  updated_at: (c) => c.updated_at,
};

export async function listCounterparties(f: CounterpartyFilters): Promise<Page<CounterpartyListItem>> {
  await latency(250, 550);
  requireUser("VIEWER", BASE);
  const page = paginate(filtered(f), f, SORTERS, [{ field: "name", dir: "asc" }], BASE);
  return { ...page, items: page.items.map(toItem) };
}

export async function getCounterparty(id: string): Promise<Counterparty> {
  await latency(200, 400);
  requireUser("VIEWER");
  return toEntity(find(id));
}

export async function getCounterpartySummary(id: string): Promise<CounterpartySummary> {
  await latency(300, 650);
  requireUser("VIEWER");
  const c = find(id);
  return {
    counterparty_id: c.id,
    as_of: BUSINESS_DATE,
    exposure: { funding: money(c.funding), credit: money(c.credit), currency: BASE_CCY },
    open_deals: c.open_deals,
    cash_flows: c.cash_flows,
    payment_behaviour: {
      window_days: 180,
      settled: c.payment.settled,
      on_time_rate: c.payment.on_time_rate.toFixed(4),
      avg_delay_days: c.payment.avg_delay_days.toFixed(1),
      failed: c.payment.failed,
    },
    latest_assessment: c.model_band ? { band: c.model_band, score: c.model_score!, as_of: c.assessed_at! } : null,
  };
}

export async function getRatingHistory(id: string): Promise<RatingHistoryItem[]> {
  await latency(250, 500);
  requireUser("VIEWER");
  find(id);
  return db()
    .ratingHistory.filter((r) => r.counterparty_id === id)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))
    .map((r) => ({ credit_rating: r.credit_rating, effective_date: r.effective_date }));
}

/* ---------- validation (mirrors the backend's Pydantic models) ---------- */

function validate(input: Partial<CounterpartyInput>, instance: string): void {
  const errors: { field: string; message: string }[] = [];
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (n.length < 2) errors.push({ field: "name", message: "must be at least 2 characters" });
    if (n.length > 120) errors.push({ field: "name", message: "must be at most 120 characters" });
  }
  if (input.counterparty_type !== undefined && !COUNTERPARTY_TYPES.includes(input.counterparty_type)) errors.push({ field: "counterparty_type", message: "unknown type" });
  if (input.country_code !== undefined && !COUNTRIES.some((c) => c.code === input.country_code)) errors.push({ field: "country_code", message: "unknown country" });
  if (input.credit_rating !== undefined && !RATINGS.includes(input.credit_rating)) errors.push({ field: "credit_rating", message: "unknown rating" });
  if (input.risk_classification !== undefined && !BANDS.includes(input.risk_classification)) errors.push({ field: "risk_classification", message: "unknown band" });
  if (errors.length) throw problem(422, "validation", "Validation failed", errors.map((e) => `${e.field} ${e.message}`).join("; "), { errors }, instance);
}

function assertUniqueName(name: string, exceptId: string | null, instance: string): void {
  const taken = db().counterparties.find((c) => c.id !== exceptId && c.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (taken) {
    throw problem(409, "duplicate", "Name already used", `"${taken.name}" already exists.`, {
      errors: [{ field: "name", message: "A counterparty with this name already exists" }],
    }, instance);
  }
}

/** One rating per counterparty per effective date (unique constraint): same-day changes replace. */
function recordRating(id: string, rating: CounterpartyRecord["credit_rating"]): void {
  const d = db();
  d.ratingHistory = d.ratingHistory.filter((r) => !(r.counterparty_id === id && r.effective_date === BUSINESS_DATE));
  d.ratingHistory.push({ id: d.ratingHistory.length + 1, counterparty_id: id, credit_rating: rating, effective_date: BUSINESS_DATE });
}

export async function createCounterparty(input: CounterpartyInput): Promise<Counterparty> {
  await latency(400, 800);
  const user = requireUser("RISK_ANALYST", BASE);
  validate(input, BASE);
  assertUniqueName(input.name, null, BASE);
  const now = nowIso();
  const rec: CounterpartyRecord = {
    id: nextId("cp"),
    name: input.name.trim(),
    counterparty_type: input.counterparty_type,
    country_code: input.country_code,
    credit_rating: input.credit_rating,
    risk_classification: input.risk_classification,
    is_active: input.is_active,
    is_synthetic: false,
    model_band: null,
    model_score: null,
    assessed_at: null,
    funding: 0,
    credit: 0,
    open_deals: 0,
    cash_flows: 0,
    payment: { settled: 0, on_time_rate: 0, avg_delay_days: 0, failed: 0 },
    version: 1,
    created_at: now,
    updated_at: now,
    created_by: user.name,
    updated_by: user.name,
  };
  db().counterparties.push(rec);
  recordRating(rec.id, rec.credit_rating);
  audit({ actor: user.name, action: "CREATE", entity_type: "counterparty", entity_id: rec.id, summary: `Created ${rec.name}` });
  commit();
  return toEntity(rec);
}

const EDITABLE = ["name", "counterparty_type", "country_code", "credit_rating", "risk_classification", "is_active"] as const;

export async function updateCounterparty(id: string, patch: CounterpartyPatch): Promise<Counterparty> {
  await latency(400, 800);
  const instance = `${BASE}/${id}`;
  const user = requireUser("RISK_ANALYST", instance);
  const c = find(id);
  if (patch.version !== c.version) {
    throw problem(409, "conflict", "Changed by someone else", `This counterparty was updated${c.updated_by ? ` by ${c.updated_by}` : ""} after you opened it.`, {}, instance);
  }
  validate(patch, instance);
  if (patch.name !== undefined) assertUniqueName(patch.name, id, instance);

  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of EDITABLE) {
    const v = patch[k];
    if (v !== undefined && v !== c[k]) {
      changes[k] = [c[k], v];
      (c as unknown as Record<string, unknown>)[k] = k === "name" ? String(v).trim() : v;
    }
  }
  if (Object.keys(changes).length) {
    c.version += 1;
    c.updated_at = nowIso();
    c.updated_by = user.name;
    if (changes.credit_rating) recordRating(c.id, c.credit_rating);
    audit({ actor: user.name, action: "UPDATE", entity_type: "counterparty", entity_id: c.id, summary: `Updated ${c.name}`, changes });
    commit();
  }
  return toEntity(c);
}

export async function deleteCounterparty(id: string, version: number): Promise<void> {
  await latency(400, 700);
  const instance = `${BASE}/${id}`;
  const user = requireUser("ADMIN", instance);
  const c = find(id);
  if (version !== c.version) throw problem(409, "conflict", "Changed by someone else", "Reload and try again.", {}, instance);
  if (c.open_deals > 0 || c.cash_flows > 0) {
    const parts = [c.open_deals && `${c.open_deals} deal${c.open_deals > 1 ? "s" : ""}`, c.cash_flows && `${c.cash_flows} cash flow${c.cash_flows > 1 ? "s" : ""}`].filter(Boolean);
    throw problem(409, "in-use", "Still referenced", `${c.name} is referenced by ${parts.join(" and ")}. Deactivate it instead, so history stays intact.`, {}, instance);
  }
  const d = db();
  d.counterparties = d.counterparties.filter((x) => x.id !== id);
  d.ratingHistory = d.ratingHistory.filter((r) => r.counterparty_id !== id);
  audit({ actor: user.name, action: "DELETE", entity_type: "counterparty", entity_id: id, summary: `Deleted ${c.name}` });
  commit();
}

export async function exportCounterpartiesCsv(f: CounterpartyFilters): Promise<{ filename: string; csv: string; rows: number }> {
  await latency(500, 900);
  const user = requireUser("VIEWER", `${BASE}/export.csv`);
  // Same filters and sort as the list, but not paged: the file holds every matching row.
  const rows = sortRows(filtered(f), f.sort, SORTERS, [{ field: "name", dir: "asc" }], `${BASE}/export.csv`);
  const csv = toCsv(
    ["id", "name", "counterparty_type", "country_code", "credit_rating", "risk_classification", "model_band", "model_score", "funding_base", "credit_base", "base_currency", "open_deals", "is_active", "updated_at"],
    rows.map((c) => [c.id, c.name, c.counterparty_type, c.country_code, c.credit_rating, c.risk_classification, c.model_band, c.model_score, money(c.funding), money(c.credit), BASE_CCY, c.open_deals, c.is_active, c.updated_at]),
  );
  audit({ actor: user.name, action: "EXPORT", entity_type: "counterparty", entity_id: null, summary: `Exported ${rows.length} counterparties (CSV)` });
  commit();
  return { filename: `counterparties_${BUSINESS_DATE}.csv`, csv, rows: rows.length };
}
