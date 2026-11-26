/**
 * Mock of /fx-rates (TECHNICAL_PLAN §4.3): history, the as-of snapshot, and
 * manual entry. Rates are unique per (currency, date); replacing an existing
 * rate must be asked for explicitly. Writes replace the `fxRates` array, which
 * invalidates the rate cache in positions.ts.
 */
import type { FxHistoryPoint, FxLatest, FxRateInput } from "@/api/fxRates";
import { isIsoDate } from "./crud";
import { audit, commit, db, nowIso, type FxRateRecord } from "./db";
import { latency } from "./latency";
import { BASE_CCY, businessDate, fmtDate } from "./lookup";
import { CURRENCY_LIST } from "./reference";
import { isBusinessDay, shiftDays } from "./schedule";
import { problem, requireUser } from "./server";

const BASE = "/api/v1/fx-rates";

function seriesFor(ccy: string, upTo: string = businessDate()): FxRateRecord[] {
  return db()
    .fxRates.filter((r) => r.currency_code === ccy && r.rate_date <= upTo)
    .sort((a, b) => a.rate_date.localeCompare(b.rate_date));
}

/** GET /fx-rates/latest?as_of= : one row per currency with recent change and a 30-point trend. */
export async function latestRates(asOf: string = businessDate()): Promise<FxLatest[]> {
  await latency(250, 500);
  requireUser("VIEWER", `${BASE}/latest`);
  return CURRENCY_LIST.filter((c) => c !== BASE_CCY).map((c) => {
    const s = seriesFor(c, asOf);
    const last = s[s.length - 1]!;
    const prev = s[s.length - 2];
    const monthAgo = [...s].reverse().find((r) => r.rate_date <= shiftDays(asOf, -30));
    const change = (from?: FxRateRecord) => (from ? (Number(last.rate_to_base) / Number(from.rate_to_base) - 1).toFixed(6) : null);
    return {
      currency_code: c,
      rate_to_base: last.rate_to_base,
      rate_date: last.rate_date,
      source: last.source,
      change_1d: change(prev),
      change_30d: change(monthAgo),
      trend: s.slice(-30).map((r) => r.rate_to_base),
    };
  });
}

/** GET /fx-rates?currency_code=&from=&to= : history, newest first. */
export async function rateHistory(ccy: string, from?: string, to?: string): Promise<FxHistoryPoint[]> {
  await latency(250, 500);
  requireUser("VIEWER", BASE);
  return db()
    .fxRates.filter((r) => r.currency_code === ccy && (!from || r.rate_date >= from) && (!to || r.rate_date <= to))
    .sort((a, b) => b.rate_date.localeCompare(a.rate_date))
    .map((r) => ({ id: r.id, rate_date: r.rate_date, rate_to_base: r.rate_to_base, source: r.source, created_by: r.created_by, created_at: r.created_at }));
}

/** POST /fx-rates */
export async function createRate(input: FxRateInput): Promise<FxHistoryPoint> {
  await latency(400, 700);
  const user = requireUser("RISK_ANALYST", BASE);
  const e: { field: string; message: string }[] = [];
  if (!CURRENCY_LIST.includes(input.currency_code) || input.currency_code === BASE_CCY) e.push({ field: "currency_code", message: `choose a currency other than the base (${BASE_CCY})` });
  if (!isIsoDate(input.rate_date)) e.push({ field: "rate_date", message: "enter the rate date" });
  else if (input.rate_date > businessDate()) e.push({ field: "rate_date", message: `can't be after the business date (${fmtDate(businessDate())})` });
  else if (!isBusinessDay(input.rate_date)) e.push({ field: "rate_date", message: "rates are recorded for business days only" });
  if (!/^\d+(\.\d{1,8})?$/.test(input.rate_to_base) || Number(input.rate_to_base) <= 0) e.push({ field: "rate_to_base", message: "enter a rate above zero with at most 8 decimal places" });
  if (e.length) throw problem(422, "validation", "Validation failed", e.map((x) => `${x.field} ${x.message}`).join("; "), { errors: e }, BASE);

  const existing = db().fxRates.find((r) => r.currency_code === input.currency_code && r.rate_date === input.rate_date);
  if (existing && !input.replace) {
    throw problem(409, "duplicate", "Rate already recorded", `A ${input.currency_code} rate for ${fmtDate(input.rate_date)} already exists.`, {
      errors: [{ field: "rate_date", message: `A ${existing.source.toLowerCase()} rate of ${Number(existing.rate_to_base)} already exists for this date. Tick "Replace" to override it.` }],
    }, BASE);
  }
  const now = nowIso();
  const rec: FxRateRecord = {
    id: Math.max(0, ...db().fxRates.map((r) => r.id)) + 1,
    currency_code: input.currency_code,
    rate_date: input.rate_date,
    rate_to_base: Number(input.rate_to_base).toFixed(8),
    source: "MANUAL",
    created_at: now,
    created_by: user.name,
  };
  db().fxRates = [...db().fxRates.filter((r) => r !== existing), rec];
  audit({
    actor: user,
    action: existing ? "UPDATE" : "CREATE",
    entity_type: "fx rate",
    entity_id: String(rec.id),
    summary: existing
      ? `Replaced ${input.currency_code} rate for ${input.rate_date}: ${existing.rate_to_base} → ${rec.rate_to_base}`
      : `Recorded ${input.currency_code} rate ${rec.rate_to_base} for ${input.rate_date}`,
  });
  commit();
  return { id: rec.id, rate_date: rec.rate_date, rate_to_base: rec.rate_to_base, source: rec.source, created_by: rec.created_by, created_at: rec.created_at };
}

/** DELETE /fx-rates/{id}: admin only, manual rates only (generated history is immutable). */
export async function deleteRate(id: number): Promise<void> {
  await latency(300, 600);
  const instance = `${BASE}/${id}`;
  const user = requireUser("ADMIN", instance);
  const r = db().fxRates.find((x) => x.id === id);
  if (!r) throw problem(404, "not-found", "Not found", "This rate no longer exists.", {}, instance);
  if (r.source !== "MANUAL") throw problem(409, "in-use", "Generated rate", "Only manually entered rates can be deleted.", {}, instance);
  db().fxRates = db().fxRates.filter((x) => x.id !== id);
  audit({ actor: user, action: "DELETE", entity_type: "fx rate", entity_id: String(id), summary: `Deleted manual ${r.currency_code} rate for ${r.rate_date}` });
  commit();
}

export const fxRatesMock = { latest: latestRates, history: rateHistory, create: createRate, remove: deleteRate };
