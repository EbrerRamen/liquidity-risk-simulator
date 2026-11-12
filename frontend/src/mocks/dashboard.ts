/**
 * Mock of the /dashboard/* endpoints (TECHNICAL_PLAN §4.3) over the synthetic
 * data in ./dashboard-data. Formulas follow §5: L0 (§5.5), AL_t (§5.6),
 * FR / survival (§5.8), SLCI (§5.9), HHI (§5.10). Money leaves as decimal strings.
 */
import {
  ACTIVE_SCENARIOS,
  ANOMALIES_BY_TYPE,
  BAND_COUNTS,
  BASE_CCY,
  BUSINESS_DATE,
  COUNTERPARTIES,
  CURRENCIES,
  FX,
  MATURITIES,
  MIN_BUFFER_BASE,
  OPENING,
  OVERDUE_INFLOWS,
  PREVIOUS,
  actualFlows,
  addDays,
  projectedFlows,
  type Band,
  type Ccy,
  type DayFlows,
} from "./dashboard-data";
import { latency } from "./latency";

/* ---------- request / response types (mirror the planned API) ---------- */

export type Horizon = 7 | 14 | 30 | 90;
export type Lookback = 30 | 90 | 180;
export type CurrencyFilter = "ALL" | Ccy;

export interface DashboardFilters {
  horizon: Horizon;
  lookback: Lookback;
  currency: CurrencyFilter;
}

type Money = string;

export interface KpiResponse {
  as_of: string;
  horizon_days: number;
  currency: string; // reporting currency of every amount below
  consolidated: boolean;
  available_liquidity: Money;
  available_liquidity_previous: Money;
  opening_breakdown: { cash: Money; securities: Money };
  expected_inflows: Money;
  expected_outflows: Money;
  net_cash_flow: Money;
  maturities: { count: number; borrow: Money; lend: Money };
  slci_30d: string | null;
  slci_30d_previous: string | null;
  /** Survival metrics apply to the consolidated position only (the buffer is set there). */
  survival: null | {
    min_buffer: Money;
    survival_days: number | null; // null: no breach within the horizon
    first_breach_date: string | null;
    min_available_liquidity: Money;
    min_date: string;
    funding_requirement: Money;
  };
  high_risk_counterparties: { count: number; disagreements: number };
  active_scenarios: number;
  overdue_inflows: { count: number; amount: Money };
}

export interface ProjectionPoint {
  date: string;
  inflows: Money;
  outflows: Money;
  net: Money;
  available_liquidity: Money;
}

export interface ProjectionResponse {
  currency: string;
  opening_liquidity: Money;
  min_buffer: Money | null;
  first_breach_date: string | null;
  min: { date: string; value: Money };
  series: ProjectionPoint[];
}

export interface CashHistoryResponse {
  currency: string;
  series: { date: string; cash: Money }[];
}

export interface FlowBucket {
  start: string;
  end: string;
  kind: "actual" | "projected";
  inflows: Money;
  outflows: Money;
  net: Money;
}

export interface FlowsResponse {
  currency: string;
  granularity: "day" | "week";
  buckets: FlowBucket[];
}

export interface MaturityBucket {
  bucket: string;
  from_day: number;
  to_day: number;
  lend: Money; // principal received
  borrow: Money; // principal repaid
  lend_count: number;
  borrow_count: number;
}

export interface MaturityScheduleResponse {
  currency: string;
  buckets: MaturityBucket[];
}

export interface CurrencyDistributionResponse {
  base_currency: string;
  total: Money;
  items: { currency: Ccy; amount: Money; amount_base: Money; share: string }[];
}

export interface ConcentrationResponse {
  basis: "funding" | "credit";
  currency: string;
  total: Money;
  hhi: string;
  effective_n: string;
  top_share_1: string;
  top_share_5: string;
  single_name_limit: string;
  items: { counterparty_id: string; name: string; type: string; exposure: Money; share: string; band: Band }[];
  others: { count: number; exposure: Money; share: string };
}

export interface RiskDistributionResponse {
  total: number;
  model: Record<Band, number>;
  analyst: Record<Band, number>;
  disagreements: number;
  anomalies: { type: string; label: string; open: number; total: number }[];
}

export interface UpcomingMaturity {
  reference: string;
  counterparty: string;
  counterparty_band: Band;
  deal_type: string;
  direction: "LEND" | "BORROW";
  currency: Ccy;
  principal: Money;
  principal_base: Money;
  rate: string;
  maturity_date: string;
}

export interface Finding {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  link: { label: string; to: string };
}

/* ---------- helpers ---------- */

const minor = (ccy: string) => (ccy === "JPY" ? 0 : 2);
const money = (n: number, ccy: string): Money => n.toFixed(minor(ccy));
const ratio = (n: number, dp = 6): string => n.toFixed(dp);

/** Reporting currency for a filter: base for ALL, else the currency itself. */
const reportingCcy = (f: CurrencyFilter) => (f === "ALL" ? BASE_CCY : f);

/** Convert a currency amount into the reporting currency at S_c(T0). */
function toReporting(amount: number, from: Ccy, filter: CurrencyFilter): number {
  return filter === "ALL" ? amount * FX[from] : amount;
}

function scope(filter: CurrencyFilter): readonly Ccy[] {
  return filter === "ALL" ? CURRENCIES : [filter];
}

function combine(filter: CurrencyFilter, source: (c: Ccy) => DayFlows[]): DayFlows[] {
  const ccys = scope(filter);
  const first = source(ccys[0]!);
  return first.map((d, i) => {
    let inflows = 0;
    let outflows = 0;
    for (const c of ccys) {
      const f = c === ccys[0] ? d : source(c)[i]!;
      inflows += toReporting(f.inflows, c, filter);
      outflows += toReporting(f.outflows, c, filter);
    }
    return { date: d.date, inflows, outflows };
  });
}

function opening(filter: CurrencyFilter) {
  let cash = 0;
  let securities = 0;
  for (const c of scope(filter)) {
    cash += toReporting(OPENING[c].cash, c, filter);
    securities += toReporting(OPENING[c].securities, c, filter);
  }
  return { cash, securities, total: cash + securities };
}

function path(filter: CurrencyFilter, horizon: number) {
  const L0 = opening(filter).total;
  const flows = combine(filter, projectedFlows).slice(0, horizon);
  let al = L0;
  let min = { date: flows[0]!.date, value: Infinity };
  const buffer = filter === "ALL" ? MIN_BUFFER_BASE : null;
  let breach: string | null = null;
  const series = flows.map((f) => {
    al += f.inflows - f.outflows;
    if (al < min.value) min = { date: f.date, value: al };
    if (buffer !== null && breach === null && al < buffer) breach = f.date;
    return { ...f, net: f.inflows - f.outflows, al };
  });
  return { L0, series, min, buffer, breach };
}

function sum(xs: DayFlows[], key: "inflows" | "outflows") {
  return xs.reduce((s, x) => s + x[key], 0);
}

function slci(filter: CurrencyFilter): number | null {
  const L0 = opening(filter).total;
  const flows = combine(filter, projectedFlows).slice(0, 30);
  const O = sum(flows, "outflows");
  const I = sum(flows, "inflows");
  const netOut = O - Math.min(I, 0.75 * O);
  return netOut === 0 ? null : L0 / netOut;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

const cpName = (id: string) => COUNTERPARTIES.find((c) => c.id === id)!;

/* ---------- endpoints ---------- */

export async function getKpis(f: DashboardFilters): Promise<KpiResponse> {
  await latency();
  const ccy = reportingCcy(f.currency);
  const open = opening(f.currency);
  const p = path(f.currency, f.horizon);
  const inflows = p.series.reduce((s, x) => s + x.inflows, 0);
  const outflows = p.series.reduce((s, x) => s + x.outflows, 0);
  const mats = MATURITIES.filter((m) => m.day <= f.horizon && (f.currency === "ALL" || m.currency === f.currency));
  const s30 = slci(f.currency);
  const prevAL = f.currency === "ALL" ? PREVIOUS.availableLiquidityBase : open.total * 0.988;

  return {
    as_of: BUSINESS_DATE,
    horizon_days: f.horizon,
    currency: ccy,
    consolidated: f.currency === "ALL",
    available_liquidity: money(open.total, ccy),
    available_liquidity_previous: money(prevAL, ccy),
    opening_breakdown: { cash: money(open.cash, ccy), securities: money(open.securities, ccy) },
    expected_inflows: money(inflows, ccy),
    expected_outflows: money(outflows, ccy),
    net_cash_flow: money(inflows - outflows, ccy),
    maturities: {
      count: mats.length,
      borrow: money(mats.filter((m) => m.direction === "BORROW").reduce((s, m) => s + toReporting(m.principal, m.currency, f.currency), 0), ccy),
      lend: money(mats.filter((m) => m.direction === "LEND").reduce((s, m) => s + toReporting(m.principal, m.currency, f.currency), 0), ccy),
    },
    slci_30d: s30 === null ? null : ratio(s30, 4),
    slci_30d_previous: s30 === null ? null : ratio(f.currency === "ALL" ? s30 + 0.064 : s30 * 1.03, 4),
    survival:
      p.buffer === null
        ? null
        : {
            min_buffer: money(p.buffer, ccy),
            survival_days: p.breach ? daysBetween(BUSINESS_DATE, p.breach) - 1 : null,
            first_breach_date: p.breach,
            min_available_liquidity: money(p.min.value, ccy),
            min_date: p.min.date,
            funding_requirement: money(Math.max(0, p.buffer - p.min.value), ccy),
          },
    high_risk_counterparties: {
      count: BAND_COUNTS.model.HIGH + BAND_COUNTS.model.CRITICAL,
      disagreements: BAND_COUNTS.disagreements,
    },
    active_scenarios: ACTIVE_SCENARIOS,
    overdue_inflows: { count: OVERDUE_INFLOWS.count, amount: money(OVERDUE_INFLOWS.amountBase / (f.currency === "ALL" ? 1 : FX[f.currency] * 4), ccy) },
  };
}

export async function getProjection(f: DashboardFilters): Promise<ProjectionResponse> {
  await latency();
  const ccy = reportingCcy(f.currency);
  const p = path(f.currency, f.horizon);
  return {
    currency: ccy,
    opening_liquidity: money(p.L0, ccy),
    min_buffer: p.buffer === null ? null : money(p.buffer, ccy),
    first_breach_date: p.breach,
    min: { date: p.min.date, value: money(p.min.value, ccy) },
    series: p.series.map((x) => ({
      date: x.date,
      inflows: money(x.inflows, ccy),
      outflows: money(x.outflows, ccy),
      net: money(x.net, ccy),
      available_liquidity: money(x.al, ccy),
    })),
  };
}

/** Historical cash (§5.12): cash only, rebuilt backwards from Cash(T0) through settled flows. */
export async function getCashHistory(f: DashboardFilters): Promise<CashHistoryResponse> {
  await latency();
  const ccy = reportingCcy(f.currency);
  const flows = combine(f.currency, actualFlows); // 180 days ending at T0
  let cash = opening(f.currency).cash;
  const values: { date: string; cash: number }[] = [];
  for (let i = flows.length - 1; i >= 0; i--) {
    values.push({ date: flows[i]!.date, cash });
    cash -= flows[i]!.inflows - flows[i]!.outflows;
  }
  values.reverse();
  return {
    currency: ccy,
    series: values.slice(-f.lookback).map((v) => ({ date: v.date, cash: money(v.cash, ccy) })),
  };
}

function bucketise(days: DayFlows[], size: number, kind: FlowBucket["kind"], fromEnd: boolean, ccy: string): FlowBucket[] {
  const out: FlowBucket[] = [];
  const n = days.length;
  // Actual weeks are anchored backwards from T0; projected weeks forwards from T0 (§5.6).
  const starts: number[] = [];
  if (fromEnd) for (let end = n; end > 0; end -= size) starts.unshift(Math.max(0, end - size));
  else for (let s = 0; s < n; s += size) starts.push(s);
  for (const s of starts) {
    const chunk = days.slice(s, Math.min(n, s + size));
    const inflows = sum(chunk, "inflows");
    const outflows = sum(chunk, "outflows");
    out.push({
      start: chunk[0]!.date,
      end: chunk[chunk.length - 1]!.date,
      kind,
      inflows: money(inflows, ccy),
      outflows: money(outflows, ccy),
      net: money(inflows - outflows, ccy),
    });
  }
  return out;
}

export async function getFlows(f: DashboardFilters): Promise<FlowsResponse> {
  await latency();
  const ccy = reportingCcy(f.currency);
  const actual = combine(f.currency, actualFlows).slice(-f.lookback);
  const projected = combine(f.currency, projectedFlows).slice(0, f.horizon);
  const granularity = f.lookback + f.horizon > 75 ? "week" : "day";
  const size = granularity === "week" ? 7 : 1;
  return {
    currency: ccy,
    granularity,
    buckets: [...bucketise(actual, size, "actual", true, ccy), ...bucketise(projected, size, "projected", false, ccy)],
  };
}

const LADDER: { bucket: string; from: number; to: number }[] = [
  { bucket: "O/N", from: 1, to: 1 },
  { bucket: "2–7d", from: 2, to: 7 },
  { bucket: "8–14d", from: 8, to: 14 },
  { bucket: "15–30d", from: 15, to: 30 },
  { bucket: "31–90d", from: 31, to: 90 },
];

export async function getMaturitySchedule(f: DashboardFilters): Promise<MaturityScheduleResponse> {
  await latency();
  const ccy = reportingCcy(f.currency);
  return {
    currency: ccy,
    buckets: LADDER.filter((b) => b.from <= f.horizon).map((b) => {
      const ms = MATURITIES.filter(
        (m) => m.day >= b.from && m.day <= Math.min(b.to, f.horizon) && (f.currency === "ALL" || m.currency === f.currency),
      );
      const lend = ms.filter((m) => m.direction === "LEND");
      const borrow = ms.filter((m) => m.direction === "BORROW");
      const total = (xs: typeof ms) => xs.reduce((s, m) => s + toReporting(m.principal, m.currency, f.currency), 0);
      return {
        bucket: b.bucket,
        from_day: b.from,
        to_day: Math.min(b.to, f.horizon),
        lend: money(total(lend), ccy),
        borrow: money(total(borrow), ccy),
        lend_count: lend.length,
        borrow_count: borrow.length,
      };
    }),
  };
}

export async function getCurrencyDistribution(): Promise<CurrencyDistributionResponse> {
  await latency();
  const rows = CURRENCIES.map((c) => {
    const local = OPENING[c].cash + OPENING[c].securities;
    return { currency: c, local, base: local * FX[c] };
  });
  const total = rows.reduce((s, r) => s + r.base, 0);
  return {
    base_currency: BASE_CCY,
    total: money(total, BASE_CCY),
    items: rows
      .sort((a, b) => b.base - a.base)
      .map((r) => ({ currency: r.currency, amount: money(r.local, r.currency), amount_base: money(r.base, BASE_CCY), share: ratio(r.base / total) })),
  };
}

export async function getConcentration(basis: "funding" | "credit"): Promise<ConcentrationResponse> {
  await latency();
  const named = COUNTERPARTIES.filter((c) => !c.id.startsWith("cp-16"));
  const others = COUNTERPARTIES.find((c) => c.id === "cp-16")!;
  const OTHER_COUNT = 33;
  const ranked = named.map((c) => ({ c, x: c[basis] })).filter((r) => r.x > 0).sort((a, b) => b.x - a.x);
  const total = ranked.reduce((s, r) => s + r.x, 0) + others[basis];
  // HHI over every name; the "others" tail is spread evenly across its 33 names.
  const hhi =
    ranked.reduce((s, r) => s + (r.x / total) ** 2, 0) + OTHER_COUNT * (others[basis] / OTHER_COUNT / total) ** 2;
  const top = ranked.slice(0, 10);
  const tail = ranked.slice(10).reduce((s, r) => s + r.x, 0) + others[basis];
  return {
    basis,
    currency: BASE_CCY,
    total: money(total, BASE_CCY),
    hhi: ratio(hhi, 4),
    effective_n: ratio(1 / hhi, 1),
    top_share_1: ratio(ranked[0]!.x / total, 4),
    top_share_5: ratio(ranked.slice(0, 5).reduce((s, r) => s + r.x, 0) / total, 4),
    single_name_limit: "0.10",
    items: top.map((r) => ({
      counterparty_id: r.c.id,
      name: r.c.name,
      type: r.c.type,
      exposure: money(r.x, BASE_CCY),
      share: ratio(r.x / total, 4),
      band: r.c.modelBand,
    })),
    others: { count: OTHER_COUNT + ranked.length - top.length, exposure: money(tail, BASE_CCY), share: ratio(tail / total, 4) },
  };
}

export async function getRiskDistribution(): Promise<RiskDistributionResponse> {
  await latency();
  const total = Object.values(BAND_COUNTS.model).reduce((s, n) => s + n, 0);
  return {
    total,
    model: BAND_COUNTS.model,
    analyst: BAND_COUNTS.analyst,
    disagreements: BAND_COUNTS.disagreements,
    anomalies: ANOMALIES_BY_TYPE,
  };
}

const DEAL_TYPE_LABEL: Record<string, string> = {
  TERM_DEPOSIT: "Term deposit",
  CALL_MONEY: "Call money",
  REPO: "Repo",
  TERM_PLACEMENT: "Term placement",
  COMMERCIAL_PAPER: "Commercial paper",
};

export async function getUpcomingMaturities(f: DashboardFilters, limit = 8): Promise<{ items: UpcomingMaturity[]; total: number }> {
  await latency();
  const all = MATURITIES.filter((m) => m.day <= f.horizon && (f.currency === "ALL" || m.currency === f.currency)).sort((a, b) => a.day - b.day);
  return {
    total: all.length,
    items: all.slice(0, limit).map((m) => {
      const cp = cpName(m.counterpartyId);
      return {
        reference: m.reference,
        counterparty: cp.name,
        counterparty_band: cp.modelBand,
        deal_type: DEAL_TYPE_LABEL[m.dealType]!,
        direction: m.direction,
        currency: m.currency,
        principal: money(m.principal, m.currency),
        principal_base: money(m.principal * FX[m.currency], BASE_CCY),
        rate: ratio(m.rate),
        maturity_date: addDays(BUSINESS_DATE, m.day),
      };
    }),
  };
}

/**
 * Rule-based findings: deterministic checks over the same numbers the tiles
 * show. (Phase 6 adds the full insights engine; this is its dashboard subset.)
 */
export async function getFindings(f: DashboardFilters): Promise<Finding[]> {
  await latency(250, 500);
  const ccy = reportingCcy(f.currency);
  const fmt = (n: number) => compact(n) + " " + ccy;
  const p = path(f.currency, f.horizon);
  const out: Finding[] = [];

  if (p.buffer !== null && p.breach) {
    out.push({
      id: "breach",
      severity: "critical",
      title: `Buffer breach on ${shortDate(p.breach)}`,
      detail: `Available liquidity falls below the ${fmt(p.buffer)} minimum buffer on day ${daysBetween(BUSINESS_DATE, p.breach)}, reaching ${fmt(p.min.value)} on ${shortDate(p.min.date)}. Funding requirement ${fmt(p.buffer - p.min.value)}.`,
      link: { label: "Liquidity position", to: `/liquidity/position?horizon=${f.horizon}` },
    });
  }

  const worst = [...p.series].sort((a, b) => a.net - b.net)[0];
  if (worst && worst.net < 0) {
    const mats = MATURITIES.filter((m) => addDays(BUSINESS_DATE, m.day) === worst.date && m.direction === "BORROW" && (f.currency === "ALL" || m.currency === f.currency));
    const why = mats.length ? ` driven by ${mats.map((m) => `${m.reference} (${cpName(m.counterpartyId).name})`).join(", ")}` : "";
    out.push({
      id: "largest-outflow",
      severity: "warning",
      title: `Largest net outflow on ${shortDate(worst.date)}`,
      detail: `Net ${fmt(worst.net)}${why}.`,
      link: { label: "Cash flows", to: `/data/cash-flows?expected_from=${worst.date}&expected_to=${worst.date}` },
    });
  }

  const conc = await getConcentration("funding");
  const over = conc.items.filter((i) => Number(i.share) > Number(conc.single_name_limit));
  if (over.length) {
    out.push({
      id: "single-name",
      severity: "warning",
      title: `${over.length} funding provider${over.length > 1 ? "s" : ""} above the 10% single-name limit`,
      detail: over.map((o) => `${o.name} ${(Number(o.share) * 100).toFixed(1)}%`).join(" · "),
      link: { label: "Concentration", to: "/liquidity/concentration?basis=funding" },
    });
  }

  out.push({
    id: "disagreements",
    severity: "info",
    title: `${BAND_COUNTS.disagreements} counterparties where the model disagrees`,
    detail: "The model's risk band differs from the analyst classification. Review the factor breakdown before changing either.",
    link: { label: "Counterparty risk", to: "/intelligence/counterparty-risk?disagreement=true" },
  });

  out.push({
    id: "overdue",
    severity: "info",
    title: `${OVERDUE_INFLOWS.count} overdue inflows excluded`,
    detail: `${compact(OVERDUE_INFLOWS.amountBase)} ${BASE_CCY} expected but not received. Conservatively excluded from projections (§5.4).`,
    link: { label: "Cash flows", to: "/data/cash-flows?overdue=true" },
  });

  return out;
}

function compact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "bn";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + "m";
  return sign + (abs / 1e3).toFixed(0) + "k";
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
}
