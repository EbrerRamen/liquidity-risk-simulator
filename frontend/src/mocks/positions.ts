/**
 * Live position figures computed from the mock database with the §5 formulas.
 * The dashboard and the data screens both read these, so a settled cash flow,
 * a cancelled deal or a new FX rate shows up everywhere at once.
 */
import { CURRENCIES, SEED_REFERENCE_DATE, actualFlows, type Ccy, type DayFlows } from "./dashboard-data";
import { businessDate, db, type CashFlowRecord } from "./db";
import { shiftDays } from "./schedule";
import { PROJECTION_DAYS, RECORD_WINDOW_DAYS } from "./seed";

/**
 * Rates are looked up on every sort comparison, so they are cached per FX
 * table. FX writes replace the `fxRates` array (never mutate it), so the
 * array's identity is the cache key.
 */
const rateCache = new Map<string, Record<Ccy, number>>();
let rateCacheFor: unknown = null;

/** S_c(d): base units per 1 unit of currency, latest rate with rate_date <= d (§5.2). */
export function ratesAt(date: string = businessDate()): Record<Ccy, number> {
  const rows = db().fxRates;
  if (rows !== rateCacheFor) {
    rateCache.clear();
    rateCacheFor = rows;
  }
  const hit = rateCache.get(date);
  if (hit) return hit;
  const computed = computeRates(date);
  rateCache.set(date, computed);
  return computed;
}

function computeRates(date: string): Record<Ccy, number> {
  const out = { USD: 1 } as Record<Ccy, number>;
  const best: Partial<Record<Ccy, string>> = {};
  for (const r of db().fxRates) {
    if (r.rate_date > date) continue;
    const c = r.currency_code as Ccy;
    if (!best[c] || r.rate_date >= best[c]!) {
      best[c] = r.rate_date;
      out[c] = Number(r.rate_to_base);
    }
  }
  return out;
}

const signed = (f: CashFlowRecord, amount: string) => (f.direction === "IN" ? 1 : -1) * Number(amount);

/** Cash_c(d) = OB + settled IN - settled OUT with actual_date in (D, d] (§5.5). */
export function cashBalance(ccy: Ccy, date: string = businessDate()): number {
  const acct = db().cashAccounts.find((a) => a.currency_code === ccy);
  if (!acct) return 0;
  let cash = Number(acct.opening_balance);
  for (const f of db().cashFlows) {
    if (f.currency_code !== ccy || f.status !== "SETTLED" || !f.actual_date) continue;
    if (f.actual_date > acct.opening_date && f.actual_date <= date) cash += signed(f, f.settled_amount!);
  }
  return cash;
}

/** Sec_c = sum of unencumbered market value x (1 - haircut) (§5.5). */
export function securitiesValue(ccy: Ccy): number {
  return db()
    .liquidAssets.filter((a) => a.currency_code === ccy && !a.is_encumbered)
    .reduce((s, a) => s + Number(a.market_value) * (1 - Number(a.haircut)), 0);
}

/** Committed line headroom (counts only when facilities are included, §5.5). */
export function committedHeadroom(ccy: Ccy): number {
  return db()
    .fundingSources.filter((f) => f.currency_code === ccy && f.funding_type === "COMMITTED_LINE")
    .reduce((s, f) => s + Number(f.available_amount) - Number(f.utilized_amount), 0);
}

const isOverdue = (f: CashFlowRecord, t0: string) => f.status === "PROJECTED" && f.expected_date <= t0;

/**
 * Projected daily flows for days 1..90 (§5.4, §5.6): projected flows on their
 * expected date; overdue outflows on day 1 (still owed); overdue inflows excluded.
 */
export function projectedDaily(ccy: Ccy): DayFlows[] {
  const T0 = businessDate();
  const days: DayFlows[] = Array.from({ length: PROJECTION_DAYS }, (_, i) => ({ date: shiftDays(T0, i + 1), inflows: 0, outflows: 0 }));
  const end = shiftDays(T0, PROJECTION_DAYS);
  for (const f of db().cashFlows) {
    if (f.currency_code !== ccy || f.status !== "PROJECTED") continue;
    let idx: number;
    if (isOverdue(f, T0)) {
      if (f.direction === "IN") continue;
      idx = 0;
    } else {
      if (f.expected_date > end) continue;
      idx = Math.round((Date.parse(f.expected_date) - Date.parse(T0)) / 86_400_000) - 1;
    }
    const d = days[idx]!;
    if (f.direction === "IN") d.inflows += Number(f.amount);
    else d.outflows += Number(f.amount);
  }
  return days;
}

const HISTORY_DAYS = 180;

/**
 * Settled daily flows for the 180 days ending at T0. From the start of the
 * seed's record window onwards they come from settled records (by actual date),
 * which also covers the days after an admin moves the business date forward;
 * older history is aggregate.
 */
export function settledDaily(ccy: Ccy): DayFlows[] {
  const T0 = businessDate();
  const recordsFrom = shiftDays(SEED_REFERENCE_DATE, -(RECORD_WINDOW_DAYS - 1));
  const aggregate = new Map(actualFlows(ccy).map((d) => [d.date, d]));
  const days: DayFlows[] = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const date = shiftDays(T0, i - (HISTORY_DAYS - 1));
    const agg = date < recordsFrom ? aggregate.get(date) : undefined;
    return agg ? { ...agg } : { date, inflows: 0, outflows: 0 };
  });
  const byDate = new Map(days.filter((d) => d.date >= recordsFrom).map((d) => [d.date, d]));
  for (const f of db().cashFlows) {
    if (f.currency_code !== ccy || f.status !== "SETTLED" || !f.actual_date) continue;
    const d = byDate.get(f.actual_date);
    if (!d) continue;
    if (f.direction === "IN") d.inflows += Number(f.settled_amount);
    else d.outflows += Number(f.settled_amount);
  }
  return days;
}

/** Inflows past their expected date and not received: a memo item, excluded from projections. */
export function overdueInflows(ccy?: Ccy): { count: number; amountBase: number; amount: number } {
  const T0 = businessDate();
  const rates = ratesAt(T0);
  let count = 0;
  let amountBase = 0;
  let amount = 0;
  for (const f of db().cashFlows) {
    if (!isOverdue(f, T0) || f.direction !== "IN" || (ccy && f.currency_code !== ccy)) continue;
    count++;
    amount += Number(f.amount);
    amountBase += Number(f.amount) * rates[f.currency_code as Ccy];
  }
  return { count, amountBase, amount };
}

export const OUTSTANDING: ReadonlySet<string> = new Set(["PENDING", "SETTLED"]);

/** Live deals (pending or settled) maturing within `days` of T0, optionally in one currency. */
export function maturingDeals(days: number, ccy?: Ccy) {
  const T0 = businessDate();
  const end = shiftDays(T0, days);
  return db().deals.filter((d) => OUTSTANDING.has(d.settlement_status) && d.maturity_date > T0 && d.maturity_date <= end && (!ccy || d.currency_code === ccy));
}

export { CURRENCIES };
