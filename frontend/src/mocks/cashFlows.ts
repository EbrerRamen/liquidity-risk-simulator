/**
 * Mock of /cash-flows (TECHNICAL_PLAN §4.3, §5.4): list views (upcoming,
 * overdue, settled, all), manual flows, settle and fail. Settling a deal's
 * principal moves the deal's status; failing its value-date flow fails the deal.
 */
import type { CashFlow, CashFlowFilters, CashFlowInput, CashFlowItem, CashFlowSummary, FailInput, SettleInput } from "@/api/cashFlows";
import type { SortSpec } from "@/api/types";
import type { Ccy } from "./dashboard-data";
import { crud, csvIn, decimalPlaces, inRange, isDec, isIsoDate, type FieldError } from "./crud";
import { audit, commit, db, nowIso, SEEDED_AT, type CashFlowRecord } from "./db";
import { latency } from "./latency";
import { BASE_CCY, BUSINESS_DATE, cpName, fmtDate, money } from "./lookup";
import { ratesAt } from "./positions";
import { CF_CATEGORIES, CURRENCY_LIST, MANUAL_CF_CATEGORIES } from "./reference";
import { problem, requireUser } from "./server";

const BASE = "/api/v1/cash-flows";
const isOverdue = (f: CashFlowRecord) => f.status === "PROJECTED" && f.expected_date <= BUSINESS_DATE;
const dealRef = (id: string | null) => (id ? (db().deals.find((d) => d.id === id)?.deal_reference ?? null) : null);
const baseOf = (f: CashFlowRecord) => Number(f.amount) * ratesAt()[f.currency_code as Ccy];

export function cashFlowItem(f: CashFlowRecord): CashFlowItem {
  return {
    id: f.id,
    transaction_reference: f.transaction_reference,
    deal_id: f.deal_id,
    deal_reference: dealRef(f.deal_id),
    counterparty_id: f.counterparty_id,
    counterparty_name: cpName(f.counterparty_id),
    currency_code: f.currency_code,
    direction: f.direction,
    category: f.category,
    source: f.source,
    amount: f.amount,
    expected_date: f.expected_date,
    settled_amount: f.settled_amount,
    actual_date: f.actual_date,
    status: f.status,
    overdue: isOverdue(f),
    version: f.version,
  };
}

function toEntity(f: CashFlowRecord): CashFlow {
  const manualOpen = f.source === "MANUAL" && f.status === "PROJECTED";
  return {
    ...cashFlowItem(f),
    note: f.note ?? null,
    is_synthetic: f.is_synthetic,
    amount_base: money(baseOf(f), BASE_CCY),
    created_at: f.created_at ?? SEEDED_AT,
    updated_at: f.updated_at ?? SEEDED_AT,
    created_by: f.created_by ?? null,
    updated_by: f.updated_by ?? null,
    actions: {
      settle: f.status === "PROJECTED",
      fail: f.status === "PROJECTED",
      edit: manualOpen,
      cancel: manualOpen,
      delete: f.source === "MANUAL" && f.status !== "SETTLED",
    },
  };
}

function inView(f: CashFlowRecord, view: CashFlowFilters["view"]) {
  if (view === "upcoming") return f.status === "PROJECTED" && f.expected_date > BUSINESS_DATE;
  if (view === "overdue") return isOverdue(f);
  if (view === "settled") return f.status === "SETTLED";
  return true;
}

function filterRows(rows: CashFlowRecord[], f: CashFlowFilters) {
  const q = f.q?.trim().toLowerCase();
  const dirs = csvIn(f.direction);
  const sts = csvIn(f.status);
  const cats = csvIn(f.category);
  const srcs = csvIn(f.source);
  const ccys = csvIn(f.currency_code);
  const cps = csvIn(f.counterparty_id);
  const view = f.view ?? "upcoming";
  return rows.filter(
    (r) =>
      inView(r, view) &&
      (!q || r.transaction_reference.toLowerCase().includes(q) || (dealRef(r.deal_id) ?? "").toLowerCase().includes(q) || (cpName(r.counterparty_id) ?? "").toLowerCase().includes(q)) &&
      (!dirs.length || dirs.includes(r.direction)) &&
      (!sts.length || sts.includes(r.status)) &&
      (!cats.length || cats.includes(r.category)) &&
      (!srcs.length || srcs.includes(r.source)) &&
      (!ccys.length || ccys.includes(r.currency_code)) &&
      (!cps.length || (r.counterparty_id !== null && cps.includes(r.counterparty_id))) &&
      (!f.deal_id || r.deal_id === f.deal_id) &&
      inRange(r.expected_date, f.expected_from, f.expected_to),
  );
}

/** Default sort per view: upcoming and overdue soonest first; settled newest first. */
export function cashFlowDefaultSort(view: CashFlowFilters["view"]): SortSpec[] {
  if (view === "settled") return [{ field: "actual_date", dir: "desc" }];
  if (view === "all") return [{ field: "expected_date", dir: "desc" }];
  return [{ field: "expected_date", dir: "asc" }];
}

function validateManual(i: CashFlowInput): FieldError[] {
  const e: FieldError[] = [];
  if (i.direction !== "IN" && i.direction !== "OUT") e.push({ field: "direction", message: "choose in or out" });
  if (!(MANUAL_CF_CATEGORIES as readonly string[]).includes(i.category)) e.push({ field: "category", message: "principal and interest come from deal schedules; choose another category" });
  if (!CURRENCY_LIST.includes(i.currency_code)) e.push({ field: "currency_code", message: "choose a currency" });
  const dp = i.currency_code === "JPY" ? 0 : 2;
  if (!isDec(i.amount) || Number(i.amount) <= 0) e.push({ field: "amount", message: "enter an amount above zero" });
  else if (decimalPlaces(i.amount) > dp) e.push({ field: "amount", message: `use at most ${dp} decimal places for ${i.currency_code}` });
  if (!isIsoDate(i.expected_date) || i.expected_date <= BUSINESS_DATE) e.push({ field: "expected_date", message: `must be after the business date (${fmtDate(BUSINESS_DATE)}); record past flows by settling them` });
  if (i.counterparty_id && !db().counterparties.some((c) => c.id === i.counterparty_id)) e.push({ field: "counterparty_id", message: "unknown counterparty" });
  return e;
}

const base = crud<CashFlowRecord, CashFlowFilters, CashFlowItem, CashFlow, CashFlowInput>({
  base: BASE,
  entity: "cash flow",
  idPrefix: "cf",
  table: () => db().cashFlows,
  setTable: (rows) => (db().cashFlows = rows),
  label: (f) => f.transaction_reference,
  filter: filterRows,
  sorters: {
    expected_date: (f) => f.expected_date,
    actual_date: (f) => f.actual_date ?? "",
    transaction_reference: (f) => f.transaction_reference,
    currency_code: (f) => f.currency_code,
    direction: (f) => f.direction,
    category: (f) => CF_CATEGORIES.indexOf(f.category),
    amount: (f) => baseOf(f),
    status: (f) => f.status,
  },
  defaultSort: (f) => cashFlowDefaultSort(f.view ?? "upcoming"),
  toItem: cashFlowItem,
  toEntity,
  editable: ["direction", "category", "currency_code", "amount", "expected_date", "counterparty_id"],
  validate: (i) => validateManual(i),
  beforeUpdate: (r) => {
    if (r.source !== "MANUAL") throw problem(409, "locked", "Scheduled flow", "This flow comes from a deal schedule. Amend the deal to change it.");
    if (r.status !== "PROJECTED") throw problem(409, "locked", "Not editable", `A ${r.status.toLowerCase()} cash flow can't be edited.`);
  },
  build: (i, { id, user, now }) => ({
    id,
    transaction_reference: `CF-${i.expected_date.replace(/-/g, "")}-M${id.split("-")[1]}`,
    deal_id: null,
    counterparty_id: i.counterparty_id ?? null,
    currency_code: i.currency_code,
    direction: i.direction,
    category: i.category,
    source: "MANUAL",
    amount: i.amount,
    expected_date: i.expected_date,
    settled_amount: null,
    actual_date: null,
    status: "PROJECTED",
    is_synthetic: false,
    version: 1,
    created_at: now,
    updated_at: now,
    created_by: user.name,
    updated_by: user.name,
  }),
  inUse: (r) => (r.source !== "MANUAL" ? "Only manual cash flows can be deleted. Scheduled flows belong to their deal." : r.status === "SETTLED" ? "Settled cash flows are part of the cash history and can't be deleted." : null),
  csv: {
    name: "cash_flows",
    header: ["id", "transaction_reference", "deal_reference", "counterparty", "currency_code", "direction", "category", "source", "amount", "expected_date", "status", "settled_amount", "actual_date"],
    row: (f) => [f.id, f.transaction_reference, dealRef(f.deal_id), cpName(f.counterparty_id), f.currency_code, f.direction, f.category, f.source, f.amount, f.expected_date, f.status, f.settled_amount, f.actual_date],
  },
});

/* ---------- operations ---------- */

function openFlow(id: string, version: number, instance: string) {
  const f = base.find(id);
  if (version !== f.version) throw problem(409, "conflict", "Changed by someone else", `This cash flow was updated${f.updated_by ? ` by ${f.updated_by}` : ""} after you opened it.`, {}, instance);
  if (f.status !== "PROJECTED") throw problem(409, "locked", "Already closed", `This cash flow is already ${f.status.toLowerCase()}.`, {}, instance);
  return f;
}

/** Keep the deal's status in step with its principal flows. */
function syncDeal(f: CashFlowRecord, user: string, now: string) {
  if (!f.deal_id || f.category !== "PRINCIPAL") return;
  const d = db().deals.find((x) => x.id === f.deal_id);
  if (!d) return;
  if (f.status === "SETTLED" && f.expected_date === d.value_date && d.settlement_status === "PENDING") d.settlement_status = "SETTLED";
  else if (f.status === "SETTLED" && f.expected_date === d.maturity_date) d.settlement_status = "MATURED";
  else if (f.status === "FAILED" && f.expected_date === d.value_date) {
    d.settlement_status = "FAILED";
    db().cashFlows = db().cashFlows.map((x) => (x.deal_id === d.id && x.status === "PROJECTED" ? { ...x, status: "CANCELLED", version: x.version + 1, updated_at: now, updated_by: user } : x));
  } else return;
  d.version += 1;
  d.updated_at = now;
  d.updated_by = user;
}

export async function settleCashFlow(id: string, input: SettleInput): Promise<CashFlow> {
  await latency(400, 800);
  const instance = `${BASE}/${id}/settle`;
  const user = requireUser("RISK_ANALYST", instance);
  const f = openFlow(id, input.version, instance);
  const acct = db().cashAccounts.find((a) => a.currency_code === f.currency_code);
  const e: FieldError[] = [];
  if (!isIsoDate(input.actual_date)) e.push({ field: "actual_date", message: "enter the settlement date" });
  else if (input.actual_date > BUSINESS_DATE) e.push({ field: "actual_date", message: `can't be after the business date (${fmtDate(BUSINESS_DATE)})` });
  else if (acct && input.actual_date <= acct.opening_date) e.push({ field: "actual_date", message: `must be after the ${f.currency_code} cash account's opening date (${fmtDate(acct.opening_date)})` });
  const dp = f.currency_code === "JPY" ? 0 : 2;
  if (!isDec(input.settled_amount) || Number(input.settled_amount) < 0) e.push({ field: "settled_amount", message: "enter the amount received or paid (zero or more)" });
  else if (decimalPlaces(input.settled_amount) > dp) e.push({ field: "settled_amount", message: `use at most ${dp} decimal places for ${f.currency_code}` });
  if (input.settled_amount !== f.amount && Number(input.settled_amount) !== Number(f.amount) && !input.note?.trim()) e.push({ field: "note", message: "explain why the amount differs from the expected amount" });
  if (e.length) throw problem(422, "validation", "Validation failed", e.map((x) => `${x.field} ${x.message}`).join("; "), { errors: e }, instance);

  const now = nowIso();
  f.status = "SETTLED";
  f.actual_date = input.actual_date;
  f.settled_amount = input.settled_amount;
  f.note = input.note?.trim() || undefined;
  f.version += 1;
  f.updated_at = now;
  f.updated_by = user.name;
  syncDeal(f, user.name, now);
  audit({ actor: user.name, action: "SETTLE", entity_type: "cash flow", entity_id: id, summary: `Settled ${f.transaction_reference}: ${input.settled_amount} ${f.currency_code} on ${input.actual_date}` });
  commit();
  return toEntity(f);
}

export async function failCashFlow(id: string, input: FailInput): Promise<CashFlow> {
  await latency(400, 700);
  const instance = `${BASE}/${id}/fail`;
  const user = requireUser("RISK_ANALYST", instance);
  const f = openFlow(id, input.version, instance);
  if (!input.note?.trim() || input.note.trim().length < 5) {
    throw problem(422, "validation", "Validation failed", "note: give the reason", { errors: [{ field: "note", message: "Give the reason (at least 5 characters)" }] }, instance);
  }
  const now = nowIso();
  f.status = "FAILED";
  f.note = input.note.trim();
  f.version += 1;
  f.updated_at = now;
  f.updated_by = user.name;
  syncDeal(f, user.name, now);
  audit({ actor: user.name, action: "FAIL", entity_type: "cash flow", entity_id: id, summary: `Failed ${f.transaction_reference}: ${f.note}` });
  commit();
  return toEntity(f);
}

export async function cancelCashFlow(id: string, version: number): Promise<CashFlow> {
  await latency(300, 600);
  const instance = `${BASE}/${id}/cancel`;
  const user = requireUser("RISK_ANALYST", instance);
  const f = openFlow(id, version, instance);
  if (f.source !== "MANUAL") throw problem(409, "locked", "Scheduled flow", "Cancel the deal to cancel its scheduled flows.", {}, instance);
  f.status = "CANCELLED";
  f.version += 1;
  f.updated_at = nowIso();
  f.updated_by = user.name;
  audit({ actor: user.name, action: "CANCEL", entity_type: "cash flow", entity_id: id, summary: `Cancelled ${f.transaction_reference}` });
  commit();
  return toEntity(f);
}

/** Counts and base-currency totals per view, scoped by currency (for the summary strip and view badges). */
export async function cashFlowSummary(f: CashFlowFilters): Promise<CashFlowSummary> {
  await latency(200, 400);
  requireUser("VIEWER");
  const ccys = csvIn(f.currency_code);
  const rows = db().cashFlows.filter((r) => !ccys.length || ccys.includes(r.currency_code));
  const acc = () => ({ count: 0, in: 0, out: 0 });
  const t = { upcoming: acc(), overdue: acc(), settled: acc() };
  const windowStart = db().cashAccounts[0]?.opening_date ?? BUSINESS_DATE;
  for (const r of rows) {
    const v = r.direction === "IN" ? "in" : "out";
    if (inView(r, "upcoming")) {
      t.upcoming.count++;
      t.upcoming[v] += baseOf(r);
    } else if (inView(r, "overdue")) {
      t.overdue.count++;
      t.overdue[v] += baseOf(r);
    } else if (r.status === "SETTLED" && r.actual_date! > windowStart) {
      t.settled.count++;
      t.settled[v] += Number(r.settled_amount) * ratesAt()[r.currency_code as Ccy];
    }
  }
  const out = (x: { count: number; in: number; out: number }) => ({ count: x.count, inflows: money(x.in, BASE_CCY), outflows: money(x.out, BASE_CCY) });
  return { base_currency: BASE_CCY, as_of: BUSINESS_DATE, settled_since: windowStart, upcoming: out(t.upcoming), overdue: out(t.overdue), settled: out(t.settled) };
}

export const cashFlowsMock = {
  list: base.list,
  get: base.get,
  create: base.create,
  update: base.update,
  remove: base.remove,
  exportCsv: base.exportCsv,
  settle: settleCashFlow,
  fail: failCashFlow,
  cancel: cancelCashFlow,
  summary: cashFlowSummary,
};
