/**
 * Mock of /deals (TECHNICAL_PLAN §4.3, §5.3, C10): list/get/export, booking with
 * a generated cash-flow schedule, schedule preview, amendment (only while no
 * flow has settled; projected flows are regenerated), cancel, and delete.
 */
import type { CashFlowItem } from "@/api/cashFlows";
import type { Deal, DealFilters, DealInput, DealItem, DealSummary, SchedulePreview } from "@/api/deals";
import { cashFlowItem } from "./cashFlows";
import { crud, csvIn, decimalPlaces, inRange, isDec, isIsoDate, type FieldError } from "./crud";
import { audit, commit, db, nextId, nowIso, type CashFlowRecord, type DealRecord } from "./db";
import { latency } from "./latency";
import { BASE_CCY, businessDate, cpName, fmtDate, money, toBase, weekendMessage } from "./lookup";
import { CURRENCY_LIST, DAY_COUNTS, DEAL_STATUSES, DEAL_TYPES, FREQUENCIES } from "./reference";
import { buildSchedule, following } from "./schedule";
import { problem, requireUser } from "./server";

const BASE = "/api/v1/deals";
const flowsOf = (id: string) => db().cashFlows.filter((f) => f.deal_id === id);
const locked = (d: DealRecord) => flowsOf(d.id).some((f) => f.status === "SETTLED");

function toItem(d: DealRecord): DealItem {
  return {
    id: d.id,
    deal_reference: d.deal_reference,
    counterparty_id: d.counterparty_id,
    counterparty_name: cpName(d.counterparty_id) ?? "Unknown counterparty",
    currency_code: d.currency_code,
    deal_type: d.deal_type,
    direction: d.direction,
    principal: d.principal,
    interest_rate: d.interest_rate,
    day_count: d.day_count,
    deal_date: d.deal_date,
    value_date: d.value_date,
    maturity_date: d.maturity_date,
    interest_frequency: d.interest_frequency,
    settlement_status: d.settlement_status,
    locked: locked(d),
    version: d.version,
  };
}

function toEntity(d: DealRecord): Deal {
  const flows = flowsOf(d.id);
  const interest = flows.filter((f) => f.category === "INTEREST" && f.status !== "CANCELLED" && f.status !== "FAILED");
  const net = interest.reduce((s, f) => s + (f.direction === "IN" ? 1 : -1) * Number(f.amount), 0);
  return {
    ...toItem(d),
    tenor_days: Math.round((Date.parse(d.maturity_date) - Date.parse(d.value_date)) / 86_400_000),
    net_interest: money(net, d.currency_code),
    principal_base: money(toBase(d.principal, d.currency_code), BASE_CCY),
    flows: { total: flows.length, settled: flows.filter((f) => f.status === "SETTLED").length, projected: flows.filter((f) => f.status === "PROJECTED").length },
    is_synthetic: d.is_synthetic,
    created_at: d.created_at,
    updated_at: d.updated_at,
    created_by: d.created_by,
    updated_by: d.updated_by,
  };
}

function filterRows(rows: DealRecord[], f: DealFilters) {
  const q = f.q?.trim().toLowerCase();
  const cps = csvIn(f.counterparty_id);
  const ccys = csvIn(f.currency_code);
  const types = csvIn(f.deal_type);
  const dirs = csvIn(f.direction);
  const sts = csvIn(f.settlement_status);
  const scope = f.scope ?? "live";
  const live = (d: DealRecord) => d.settlement_status === "PENDING" || d.settlement_status === "SETTLED";
  return rows.filter(
    (d) =>
      (scope === "all" || (scope === "live" ? live(d) : !live(d))) &&
      (!q || d.deal_reference.toLowerCase().includes(q) || (cpName(d.counterparty_id) ?? "").toLowerCase().includes(q)) &&
      (!cps.length || cps.includes(d.counterparty_id)) &&
      (!ccys.length || ccys.includes(d.currency_code)) &&
      (!types.length || types.includes(d.deal_type)) &&
      (!dirs.length || dirs.includes(d.direction)) &&
      (!sts.length || sts.includes(d.settlement_status)) &&
      inRange(d.maturity_date, f.maturity_from, f.maturity_to) &&
      inRange(d.value_date, f.value_from, f.value_to),
  );
}

/* ---------- validation (mirrors the backend's rules) ---------- */

function validateDeal(i: DealInput): FieldError[] {
  const e: FieldError[] = [];
  const cp = db().counterparties.find((c) => c.id === i.counterparty_id);
  if (!cp) e.push({ field: "counterparty_id", message: "choose a counterparty" });
  else if (!cp.is_active) e.push({ field: "counterparty_id", message: `${cp.name} is inactive and can't be used for new deals` });
  if (!CURRENCY_LIST.includes(i.currency_code)) e.push({ field: "currency_code", message: "choose a currency" });
  if (!DEAL_TYPES.includes(i.deal_type)) e.push({ field: "deal_type", message: "choose a deal type" });
  if (i.direction !== "LEND" && i.direction !== "BORROW") e.push({ field: "direction", message: "choose lend or borrow" });
  if (!DAY_COUNTS.includes(i.day_count)) e.push({ field: "day_count", message: "choose a day count" });
  if (!FREQUENCIES.includes(i.interest_frequency)) e.push({ field: "interest_frequency", message: "choose how interest is paid" });
  const dp = i.currency_code === "JPY" ? 0 : 2;
  if (!isDec(i.principal) || Number(i.principal) <= 0) e.push({ field: "principal", message: "enter a principal above zero" });
  else if (decimalPlaces(i.principal) > dp) e.push({ field: "principal", message: `use at most ${dp} decimal places for ${i.currency_code}` });
  if (!isDec(i.interest_rate) || Number(i.interest_rate) < -0.1 || Number(i.interest_rate) > 1) e.push({ field: "interest_rate", message: "must be between -10% and 100%" });
  else if (decimalPlaces(i.interest_rate) > 8) e.push({ field: "interest_rate", message: "use at most 6 decimal places in percent" });

  if (!isIsoDate(i.deal_date)) e.push({ field: "deal_date", message: "enter the trade date" });
  else if (i.deal_date > businessDate()) e.push({ field: "deal_date", message: `can't be after the business date (${fmtDate(businessDate())})` });
  if (!isIsoDate(i.value_date)) e.push({ field: "value_date", message: "enter the value date" });
  else {
    const wk = weekendMessage(i.value_date);
    if (i.value_date <= businessDate()) e.push({ field: "value_date", message: `must be after the business date; ${fmtDate(businessDate())} is closed` });
    else if (wk) e.push({ field: "value_date", message: wk });
    else if (isIsoDate(i.deal_date) && i.value_date < i.deal_date) e.push({ field: "value_date", message: "can't be before the trade date" });
  }
  if (!isIsoDate(i.maturity_date)) e.push({ field: "maturity_date", message: "enter the maturity date" });
  else {
    const wk = weekendMessage(i.maturity_date);
    if (isIsoDate(i.value_date) && i.maturity_date <= i.value_date) e.push({ field: "maturity_date", message: "must be after the value date" });
    else if (wk) e.push({ field: "maturity_date", message: wk });
    else if (i.deal_type === "OVERNIGHT" && isIsoDate(i.value_date) && i.maturity_date !== following(new Date(Date.parse(i.value_date + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10))) {
      e.push({ field: "maturity_date", message: "overnight deals mature on the next business day" });
    }
  }
  return e;
}

function scheduleFor(i: DealInput) {
  return buildSchedule({
    direction: i.direction,
    currency: i.currency_code,
    principal: i.principal,
    interest_rate: i.interest_rate,
    day_count: i.day_count,
    value_date: i.value_date,
    maturity_date: i.maturity_date,
    interest_frequency: i.interest_frequency,
  });
}

let cfSeq = 90_000;
function projectedFlows(deal: DealRecord, user: string, now: string): CashFlowRecord[] {
  return scheduleFor(deal).flows.map((f) => ({
    id: nextId("cf"),
    transaction_reference: `CF-${f.date.replace(/-/g, "")}-${++cfSeq}`,
    deal_id: deal.id,
    counterparty_id: deal.counterparty_id,
    currency_code: deal.currency_code,
    direction: f.direction,
    category: f.kind,
    source: "DEAL_SCHEDULE",
    amount: f.amount,
    expected_date: f.date,
    settled_amount: null,
    actual_date: null,
    status: "PROJECTED",
    is_synthetic: false,
    version: 1,
    created_at: now,
    updated_at: now,
    created_by: user,
    updated_by: user,
  }));
}

const EDITABLE = ["counterparty_id", "currency_code", "deal_type", "direction", "principal", "interest_rate", "day_count", "deal_date", "value_date", "maturity_date", "interest_frequency"] as const;

const base = crud<DealRecord, DealFilters, DealItem, Deal, DealInput>({
  base: BASE,
  entity: "deal",
  idPrefix: "dl",
  table: () => db().deals,
  setTable: (rows) => (db().deals = rows),
  label: (d) => d.deal_reference,
  filter: filterRows,
  sorters: {
    deal_reference: (d) => d.deal_reference,
    counterparty: (d) => cpName(d.counterparty_id) ?? "",
    currency_code: (d) => d.currency_code,
    deal_type: (d) => d.deal_type,
    direction: (d) => d.direction,
    principal: (d) => toBase(d.principal, d.currency_code),
    interest_rate: (d) => Number(d.interest_rate),
    value_date: (d) => d.value_date,
    maturity_date: (d) => d.maturity_date,
    settlement_status: (d) => DEAL_STATUSES.indexOf(d.settlement_status),
  },
  defaultSort: [{ field: "maturity_date", dir: "asc" }],
  toItem,
  toEntity,
  editable: EDITABLE,
  validate: (i) => validateDeal(i),
  build: () => {
    throw new Error("deals are created through createDeal");
  },
  csv: {
    name: "deals",
    header: ["id", "deal_reference", "counterparty", "currency_code", "deal_type", "direction", "principal", "interest_rate", "day_count", "deal_date", "value_date", "maturity_date", "interest_frequency", "settlement_status"],
    row: (d) => [d.id, d.deal_reference, cpName(d.counterparty_id), d.currency_code, d.deal_type, d.direction, d.principal, d.interest_rate, d.day_count, d.deal_date, d.value_date, d.maturity_date, d.interest_frequency, d.settlement_status],
  },
});

function invalid(errors: FieldError[], instance: string) {
  return problem(422, "validation", "Validation failed", errors.map((x) => `${x.field} ${x.message}`).join("; "), { errors }, instance);
}

export async function previewSchedule(input: DealInput): Promise<SchedulePreview> {
  await latency(120, 260);
  requireUser("RISK_ANALYST", `${BASE}/preview-schedule`);
  const errors = validateDeal(input);
  if (errors.length) throw invalid(errors, `${BASE}/preview-schedule`);
  const s = scheduleFor(input);
  return { ...s, currency_code: input.currency_code, day_count: input.day_count };
}

let refSeq = 4200;
export async function createDeal(input: DealInput): Promise<Deal> {
  await latency(500, 900);
  const user = requireUser("RISK_ANALYST", BASE);
  const errors = validateDeal(input);
  if (errors.length) throw invalid(errors, BASE);
  let ref: string;
  do ref = `MMD-2026-00${++refSeq}`;
  while (db().deals.some((d) => d.deal_reference === ref));
  const now = nowIso();
  const deal: DealRecord = {
    id: nextId("dl"),
    deal_reference: ref,
    ...input,
    settlement_status: "PENDING",
    is_synthetic: false,
    version: 1,
    created_at: now,
    updated_at: now,
    created_by: user.name,
    updated_by: user.name,
  };
  db().deals = [...db().deals, deal];
  db().cashFlows = [...db().cashFlows, ...projectedFlows(deal, user.name, now)];
  audit({ actor: user, action: "CREATE", entity_type: "deal", entity_id: deal.id, summary: `Booked ${ref} (${input.direction} ${input.principal} ${input.currency_code})` });
  commit();
  return toEntity(deal);
}

export async function updateDeal(id: string, patch: Partial<DealInput> & { version: number }): Promise<Deal> {
  await latency(500, 900);
  const instance = `${BASE}/${id}`;
  const user = requireUser("RISK_ANALYST", instance);
  const d = base.find(id);
  if (patch.version !== d.version) throw problem(409, "conflict", "Changed by someone else", `This deal was updated${d.updated_by ? ` by ${d.updated_by}` : ""} after you opened it.`, {}, instance);
  if (d.settlement_status === "CANCELLED" || d.settlement_status === "FAILED" || d.settlement_status === "MATURED") {
    throw problem(409, "locked", "Deal is closed", `A ${d.settlement_status.toLowerCase()} deal can't be amended.`, {}, instance);
  }
  if (locked(d)) {
    throw problem(409, "locked", "Economics are locked", "Cash flows of this deal have settled, so its terms can't change. Cancel it and book a new deal instead.", {}, instance);
  }
  const merged = { ...Object.fromEntries(EDITABLE.map((k) => [k, d[k]])), ...patch } as DealInput & { version: number };
  const errors = validateDeal(merged);
  if (errors.length) throw invalid(errors, instance);
  const diff: Record<string, [unknown, unknown]> = {};
  for (const k of EDITABLE) {
    if (merged[k] !== d[k]) {
      diff[k] = [d[k], merged[k]];
      (d as unknown as Record<string, unknown>)[k] = merged[k];
    }
  }
  if (Object.keys(diff).length) {
    const now = nowIso();
    d.version += 1;
    d.updated_at = now;
    d.updated_by = user.name;
    // Regenerate projected flows in the same transaction (§5.3 lifecycle).
    db().cashFlows = [...db().cashFlows.filter((f) => !(f.deal_id === id && f.status === "PROJECTED")), ...projectedFlows(d, user.name, now)];
    audit({ actor: user, action: "UPDATE", entity_type: "deal", entity_id: id, summary: `Amended ${d.deal_reference}; schedule regenerated`, changes: diff });
    commit();
  }
  return toEntity(d);
}

export async function cancelDeal(id: string, version: number): Promise<Deal> {
  await latency(400, 700);
  const instance = `${BASE}/${id}/cancel`;
  const user = requireUser("RISK_ANALYST", instance);
  const d = base.find(id);
  if (version !== d.version) throw problem(409, "conflict", "Changed by someone else", "Reload and try again.", {}, instance);
  if (d.settlement_status !== "PENDING" && d.settlement_status !== "SETTLED") throw problem(409, "locked", "Can't cancel", `A ${d.settlement_status.toLowerCase()} deal can't be cancelled.`, {}, instance);
  const now = nowIso();
  let n = 0;
  db().cashFlows = db().cashFlows.map((f) => {
    if (f.deal_id !== id || f.status !== "PROJECTED") return f;
    n++;
    return { ...f, status: "CANCELLED", version: f.version + 1, updated_at: now, updated_by: user.name };
  });
  d.settlement_status = "CANCELLED";
  d.version += 1;
  d.updated_at = now;
  d.updated_by = user.name;
  audit({ actor: user, action: "CANCEL", entity_type: "deal", entity_id: id, summary: `Cancelled ${d.deal_reference}; ${n} projected flows cancelled` });
  commit();
  return toEntity(d);
}

export async function deleteDeal(id: string, version: number): Promise<void> {
  await latency(400, 700);
  const instance = `${BASE}/${id}`;
  const user = requireUser("ADMIN", instance);
  const d = base.find(id);
  if (version !== d.version) throw problem(409, "conflict", "Changed by someone else", "Reload and try again.", {}, instance);
  if (locked(d)) throw problem(409, "in-use", "Has settled flows", "Cash flows of this deal have settled. Cancel it instead, so the history stays intact.", {}, instance);
  db().deals = db().deals.filter((x) => x.id !== id);
  db().cashFlows = db().cashFlows.filter((f) => f.deal_id !== id);
  audit({ actor: user, action: "DELETE", entity_type: "deal", entity_id: id, summary: `Deleted ${d.deal_reference}` });
  commit();
}

export async function dealCashFlows(id: string): Promise<CashFlowItem[]> {
  await latency(200, 400);
  requireUser("VIEWER");
  base.find(id);
  return flowsOf(id)
    .sort((a, b) => a.expected_date.localeCompare(b.expected_date) || (a.category === "PRINCIPAL" ? -1 : 1))
    .map(cashFlowItem);
}

/** Outstanding deals in the current filter, in base currency. */
export async function dealSummary(f: DealFilters): Promise<DealSummary> {
  await latency(200, 400);
  requireUser("VIEWER");
  const live = filterRows(db().deals, f).filter((d) => d.settlement_status === "PENDING" || d.settlement_status === "SETTLED");
  const sum = (dir: "LEND" | "BORROW") => live.filter((d) => d.direction === dir).reduce((s, d) => s + toBase(d.principal, d.currency_code), 0);
  const in30 = new Date(Date.parse(businessDate() + "T00:00:00Z") + 30 * 86_400_000).toISOString().slice(0, 10);
  const next = [...live].sort((a, b) => a.maturity_date.localeCompare(b.maturity_date))[0];
  return {
    base_currency: BASE_CCY,
    live: live.length,
    borrowed: money(sum("BORROW"), BASE_CCY),
    lent: money(sum("LEND"), BASE_CCY),
    maturing_30d: live.filter((d) => d.maturity_date <= in30).length,
    next_maturity: next ? { deal_id: next.id, reference: next.deal_reference, date: next.maturity_date } : null,
  };
}

export const dealsMock = {
  list: base.list,
  get: base.get,
  exportCsv: base.exportCsv,
  create: createDeal,
  update: updateDeal,
  cancel: cancelDeal,
  remove: deleteDeal,
  previewSchedule,
  cashFlows: dealCashFlows,
  summary: dealSummary,
};
