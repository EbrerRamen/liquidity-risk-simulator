/**
 * Deterministic seed for the mock database (TECHNICAL_PLAN §6.1: reproducible,
 * seeded). Built so the dashboard's figures come out of the records:
 *
 *  - Deals produce their cash-flow schedules with the §5.3 engine.
 *  - Business-as-usual (BAU) flows fill each day up to the per-currency daily
 *    totals in ./dashboard-data, so projections match the dashboard design.
 *  - Cash account opening balances are solved so Cash(T0) (§5.5) matches.
 *  - Securities are sized so the haircut-adjusted buffer per currency matches.
 *  - FX history ends exactly on the T0 rates.
 *
 * Records cover a window of 30 days of settled history and 90 days of
 * projections; older history stays aggregate (see positions.ts).
 */
import {
  BUSINESS_DATE as T0,
  CURRENCIES,
  FX,
  MATURITIES,
  NAMED_COUNTERPARTIES,
  OPENING,
  OTHERS_TOTALS,
  actualFlows,
  mulberry32,
  projectedFlows,
  seedFor,
  type Ccy,
} from "./dashboard-data";
import type {
  CashAccountRecord,
  CashFlowRecord,
  CounterpartyRecord,
  Db,
  DealRecord,
  ExposureRecord,
  FundingSourceRecord,
  FxRateRecord,
  LiquidAssetRecord,
  RatingHistoryRecord,
} from "./db";
import { DEFAULT_HAIRCUT, RATINGS, type AssetClass, type Band, type CashFlowCategory, type CounterpartyType, type DealType, type InterestFrequency, type Rating } from "./reference";
import { buildSchedule, DEFAULT_DAY_COUNT, following, isBusinessDay, minorUnits, shiftDays } from "./schedule";

/** Bump when the seed or record shapes change, so stale session copies are discarded. */
export const SCHEMA = 2;
export const RECORD_WINDOW_DAYS = 30; // settled history kept as records: (T0-30, T0]
export const PROJECTION_DAYS = 90;

const SHARE: Record<Ccy, number> = { USD: 0.46, EUR: 0.22, GBP: 0.12, JPY: 0.08, CHF: 0.055, AUD: 0.04, SGD: 0.025 };
const BASE_RATE: Record<Ccy, number> = { USD: 0.05, EUR: 0.033, GBP: 0.047, JPY: 0.001, CHF: 0.01, AUD: 0.043, SGD: 0.03 };

const created = (i: number) => new Date(Date.UTC(2024, 1 + (i % 20), 3 + ((i * 7) % 24), 9, 0)).toISOString();
const meta = (i: number, version = 1) => ({ version, created_at: created(i), updated_at: created(i + 3), created_by: null, updated_by: null });

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => (sum === 0 ? 0 : Math.round((total * w) / sum / 1e5) * 1e5));
}

const toMinor = (n: number, ccy: string) => Math.round(n * 10 ** minorUnits(ccy));
const fromMinor = (m: number, ccy: string) => (m / 10 ** minorUnits(ccy)).toFixed(minorUnits(ccy));
const prevBusinessDay = (iso: string) => {
  let d = iso;
  while (!isBusinessDay(d)) d = shiftDays(d, -1);
  return d;
};

/* ======================= counterparties ======================= */

const RATING_FOR: Record<Band, Rating[]> = {
  LOW: ["AA", "AA-", "A+", "A", "A-"],
  MEDIUM: ["BBB+", "BBB", "BBB-"],
  HIGH: ["BB+", "BB", "BB-"],
  CRITICAL: ["B", "B-", "CCC"],
};
const SCORE_RANGE: Record<Band, [number, number]> = { LOW: [8, 29], MEDIUM: [31, 54], HIGH: [56, 74], CRITICAL: [76, 93] };

const OTHER_NAMES: { name: string; type: CounterpartyType; country: string }[] = [
  { name: "Aurora Landesbank", type: "BANK", country: "DE" },
  { name: "Bluewater Savings Bank", type: "BANK", country: "IE" },
  { name: "Cedar Hill Bank", type: "BANK", country: "US" },
  { name: "Fjordline Sparebank", type: "BANK", country: "NO" },
  { name: "Glacier Point Bank", type: "BANK", country: "CA" },
  { name: "Harbourside Banque", type: "BANK", country: "LU" },
  { name: "Ironbridge Commercial Bank", type: "BANK", country: "GB" },
  { name: "Kingsgate Private Bank", type: "BANK", country: "CH" },
  { name: "Lotus Bay Bank", type: "BANK", country: "SG" },
  { name: "Maple Crest Trust Bank", type: "BANK", country: "CA" },
  { name: "Central Bank of Valoria", type: "CENTRAL_BANK", country: "XV" },
  { name: "Ashford Logistics Holdings", type: "CORPORATE", country: "GB" },
  { name: "Brightwater Utilities", type: "CORPORATE", country: "AU" },
  { name: "Copperfield Mining Corp", type: "CORPORATE", country: "CA" },
  { name: "Delta Ridge Foods", type: "CORPORATE", country: "US" },
  { name: "Evergreen Paper Industries", type: "CORPORATE", country: "NO" },
  { name: "Falcon Aero Components", type: "CORPORATE", country: "FR" },
  { name: "Juniper Pharma Holdings", type: "CORPORATE", country: "IE" },
  { name: "Larkspur Retail Group", type: "CORPORATE", country: "NL" },
  { name: "Stonebridge Telecom", type: "CORPORATE", country: "DE" },
  { name: "Keystone Leasing Finance", type: "NBFI", country: "US" },
  { name: "Monarch Consumer Credit", type: "NBFI", country: "GB" },
  { name: "Northwind Factoring", type: "NBFI", country: "NL" },
  { name: "Riverstone Securities", type: "NBFI", country: "AU" },
  { name: "Tidewater Clearing Services", type: "NBFI", country: "LU" },
  { name: "Vantage Broker Finance", type: "NBFI", country: "SG" },
  { name: "Fernhill Money Market Fund", type: "FUND", country: "IE" },
  { name: "Oakmont Liquidity Fund", type: "FUND", country: "LU" },
  { name: "Pinnacle Short Duration Fund", type: "FUND", country: "US" },
  { name: "Seabright Pension Trust", type: "FUND", country: "GB" },
  { name: "Westbrook Insurance Fund", type: "FUND", country: "CH" },
  { name: "Zenith Sovereign Reserve Fund", type: "FUND", country: "NO" },
  { name: "Quarry Lane Building Society", type: "BANK", country: "GB" },
];

const INACTIVE: { name: string; type: CounterpartyType; country: string; referenced: boolean }[] = [
  { name: "Harrow Vale Credit Union", type: "NBFI", country: "GB", referenced: true },
  { name: "Silverline Capital Fund", type: "FUND", country: "LU", referenced: true },
  { name: "Redwood Mercantile Bank", type: "BANK", country: "US", referenced: false },
  { name: "Mariner Trade Finance", type: "NBFI", country: "SG", referenced: false },
];

/** Analyst classification for the 33 generated active names (the model agrees for these). */
const OTHER_BANDS: Band[] = [...Array<Band>(15).fill("LOW"), ...Array<Band>(9).fill("MEDIUM"), ...Array<Band>(6).fill("HIGH"), ...Array<Band>(3).fill("CRITICAL")];

function seedCounterparties(): { counterparties: CounterpartyRecord[]; ratingHistory: RatingHistoryRecord[]; inactiveReferenced: string[] } {
  const rnd = mulberry32(seedFor("db-counterparties"));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const score = (b: Band) => {
    const [lo, hi] = SCORE_RANGE[b];
    return Math.round(lo + rnd() * (hi - lo));
  };
  const payment = (b: Band, n: number) => ({
    settled: n,
    on_time_rate: { LOW: 0.985, MEDIUM: 0.955, HIGH: 0.9, CRITICAL: 0.81 }[b] - rnd() * 0.02,
    avg_delay_days: { LOW: 0.1, MEDIUM: 0.4, HIGH: 1.3, CRITICAL: 2.8 }[b] + rnd() * 0.4,
    failed: b === "CRITICAL" ? 2 + Math.floor(rnd() * 3) : b === "HIGH" ? Math.floor(rnd() * 2) : 0,
  });

  const counterparties: CounterpartyRecord[] = [];
  NAMED_COUNTERPARTIES.forEach((c, i) => {
    counterparties.push({
      id: c.id,
      name: c.name,
      counterparty_type: c.type,
      country_code: c.country,
      credit_rating: c.id === "cp-12" ? "BBB" : pick(RATING_FOR[c.classification]),
      risk_classification: c.classification,
      is_active: true,
      is_synthetic: true,
      model_band: c.modelBand,
      model_score: score(c.modelBand),
      assessed_at: T0,
      funding: c.funding,
      credit: c.credit,
      payment: payment(c.modelBand, 30 + Math.floor(rnd() * 60)),
      version: 1 + Math.floor(rnd() * 4),
      created_at: created(i),
      updated_at: new Date(Date.UTC(2026, 9, 1 + Math.floor(rnd() * 40), 10)).toISOString(),
      created_by: null,
      updated_by: null,
    });
  });

  const bands = shuffle(OTHER_BANDS, rnd);
  const fundings = split(OTHERS_TOTALS.funding, OTHER_NAMES.map((o) => (o.type === "CENTRAL_BANK" ? 0 : 0.3 + rnd())));
  const credits = split(OTHERS_TOTALS.credit, OTHER_NAMES.map(() => 0.2 + rnd()));
  OTHER_NAMES.forEach((o, i) => {
    const band = o.type === "CENTRAL_BANK" ? "LOW" : bands[i]!;
    counterparties.push({
      id: `cp-${String(i + 17).padStart(2, "0")}`,
      name: o.name,
      counterparty_type: o.type,
      country_code: o.country,
      credit_rating: o.type === "CENTRAL_BANK" ? "BBB" : pick(RATING_FOR[band]),
      risk_classification: band,
      is_active: true,
      is_synthetic: true,
      model_band: band,
      model_score: score(band),
      assessed_at: T0,
      funding: fundings[i]!,
      credit: credits[i]!,
      payment: payment(band, 8 + Math.floor(rnd() * 40)),
      version: 1 + Math.floor(rnd() * 3),
      created_at: created(i + 15),
      updated_at: new Date(Date.UTC(2026, 6 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 27), 10)).toISOString(),
      created_by: null,
      updated_by: null,
    });
  });

  const inactiveReferenced: string[] = [];
  INACTIVE.forEach((o, i) => {
    const id = `cp-${String(i + 50).padStart(2, "0")}`;
    if (o.referenced) inactiveReferenced.push(id);
    counterparties.push({
      id,
      name: o.name,
      counterparty_type: o.type,
      country_code: o.country,
      credit_rating: pick(RATING_FOR.HIGH),
      risk_classification: "HIGH",
      is_active: false,
      is_synthetic: true,
      model_band: null,
      model_score: null,
      assessed_at: null,
      funding: 0,
      credit: 0,
      payment: { settled: o.referenced ? 10 : 0, on_time_rate: 0.9, avg_delay_days: 1.1, failed: 0 },
      version: 2,
      created_at: created(i + 48),
      updated_at: new Date(Date.UTC(2026, 2 + i, 12, 10)).toISOString(),
      created_by: null,
      updated_by: null,
    });
  });

  // Rating history: 2-4 changes over the last three years, ending at the current rating.
  let rid = 1;
  const ratingHistory: RatingHistoryRecord[] = [];
  for (const c of counterparties) {
    const n = 1 + Math.floor(rnd() * 3);
    let idx = RATINGS.indexOf(c.credit_rating);
    const entries: RatingHistoryRecord[] = [];
    for (let k = 0; k <= n; k++) {
      const daysBack = k === 0 ? 30 + Math.floor(rnd() * 200) : 250 + k * 220 + Math.floor(rnd() * 120);
      entries.push({ id: 0, counterparty_id: c.id, credit_rating: RATINGS[idx]!, effective_date: shiftDays(T0, -daysBack) });
      idx = Math.max(0, Math.min(RATINGS.length - 1, idx + (rnd() < 0.5 ? -1 : 1)));
    }
    for (const e of entries.reverse()) ratingHistory.push({ ...e, id: rid++ });
  }
  return { counterparties, ratingHistory, inactiveReferenced };
}

/* ======================= FX rates ======================= */

function seedFx(): FxRateRecord[] {
  const rnd = mulberry32(seedFor("fx-history"));
  const out: FxRateRecord[] = [];
  let id = 1;
  for (const c of CURRENCIES) {
    if (c === "USD") continue;
    let rate = FX[c];
    const vol = c === "JPY" ? 0.005 : 0.0035;
    const rows: FxRateRecord[] = [];
    for (let t = 0; t >= -200; t--) {
      const date = shiftDays(T0, t);
      if (!isBusinessDay(date)) continue;
      rows.push({ id: 0, currency_code: c, rate_date: date, rate_to_base: rate.toFixed(8), source: "SYNTHETIC", created_at: `${date}T17:00:00.000Z`, created_by: null });
      const shock = (rnd() + rnd() + rnd() - 1.5) * 2 * vol;
      rate = rate / (1 + shock);
    }
    for (const r of rows.reverse()) out.push({ ...r, id: id++ });
  }
  return out;
}

/* ======================= deals and their schedules ======================= */

interface DealSpec {
  ref: string;
  cp: string;
  type: DealType;
  dir: "LEND" | "BORROW";
  ccy: Ccy;
  principal: number;
  rate: number;
  value: string;
  maturity: string;
  freq: InterestFrequency;
  status: DealRecord["settlement_status"];
}

const niceAmount = (usdEquiv: number, ccy: Ccy) => {
  const unit = ccy === "JPY" ? 100_000_000 : 1_000_000;
  return Math.max(unit, Math.round(usdEquiv / FX[ccy] / unit) * unit);
};

function dealSpecs(rnd: () => number, cps: CounterpartyRecord[], aggProj: Record<Ccy, ReturnType<typeof projectedFlows>>, aggPast: Record<Ccy, ReturnType<typeof actualFlows>>): DealSpec[] {
  const specs: DealSpec[] = [];
  const pickCcy = (): Ccy => {
    let x = rnd();
    for (const c of CURRENCIES) {
      x -= SHARE[c];
      if (x <= 0) return c;
    }
    return "USD";
  };
  const active = cps.filter((c) => c.is_active && c.counterparty_type !== "CENTRAL_BANK" && c.counterparty_type !== "SOVEREIGN");

  // a) The 20 maturities the dashboard was designed around: live deals.
  for (const m of MATURITIES) {
    const maturity = shiftDays(T0, m.day);
    let value: string;
    if (m.dealType === "OVERNIGHT") value = T0;
    else {
      // Value dates fall before the settled-records window, so the window only
      // holds maturities and interest (keeps opening cash balances sensible).
      const options = [61, 91, 182, 273, 365];
      let i = options.findIndex((o) => o >= m.day + RECORD_WINDOW_DAYS + 1);
      if (rnd() < 0.3 && i < options.length - 1) i++;
      value = prevBusinessDay(shiftDays(maturity, -options[i]!));
    }
    const tenor = (Date.parse(maturity) - Date.parse(value)) / 86_400_000;
    specs.push({ ref: m.reference, cp: m.counterpartyId, type: m.dealType, dir: m.direction, ccy: m.currency, principal: m.principal, rate: m.rate, value, maturity, freq: tenor >= 273 ? "QUARTERLY" : "AT_MATURITY", status: "SETTLED" });
  }

  // b) Longer live deals maturing beyond the 90-day projection window.
  for (let i = 0; i < 24; i++) {
    const ccy = pickCcy();
    const dir = rnd() < 0.55 ? "BORROW" : "LEND";
    const pool = active.filter((c) => (dir === "BORROW" ? c.funding > 0 : c.credit > 0));
    const cp = pool[Math.floor(rnd() * pool.length)]!;
    const day = 95 + Math.floor(rnd() * 320);
    const maturity = following(shiftDays(T0, day));
    const tenor = [182, 273, 365, 548, 730].find((t) => t > day + RECORD_WINDOW_DAYS + 5) ?? 730;
    const value = prevBusinessDay(shiftDays(maturity, -tenor));
    const type: DealType = dir === "BORROW" ? (rnd() < 0.25 ? "REPO" : rnd() < 0.15 ? "CD" : "TERM_DEPOSIT") : rnd() < 0.2 ? "CP" : "TERM_DEPOSIT";
    specs.push({
      ref: `MMD-2025-00${String(5200 + i * 13)}`,
      cp: cp.id,
      type,
      dir,
      ccy,
      principal: niceAmount(25e6 + rnd() * 190e6, ccy),
      rate: Math.max(-0.002, BASE_RATE[ccy] + (rnd() - 0.4) * 0.006),
      value,
      maturity,
      freq: tenor >= 365 ? (rnd() < 0.6 ? "QUARTERLY" : "SEMI_ANNUAL") : "AT_MATURITY",
      status: "SETTLED",
    });
  }

  // c) Forward-starting deals (pending): sized to fit the day's projected flows.
  const pending: { k: number; dir: "LEND" | "BORROW"; ccy: Ccy; cp: string }[] = [
    { k: 5, dir: "LEND", ccy: "USD", cp: "cp-10" },
    { k: 9, dir: "BORROW", ccy: "EUR", cp: "cp-02" },
    { k: 16, dir: "LEND", ccy: "GBP", cp: "cp-17" },
    { k: 26, dir: "BORROW", ccy: "USD", cp: "cp-04" },
  ];
  pending.forEach((p, i) => {
    const value = following(shiftDays(T0, p.k));
    const t = (Date.parse(value) - Date.parse(T0)) / 86_400_000;
    const day = aggProj[p.ccy][t - 1]!;
    const matOnDay = MATURITIES.filter((m) => m.currency === p.ccy && m.day === t);
    const cap = p.dir === "LEND" ? day.outflows - matOnDay.filter((m) => m.direction === "BORROW").reduce((s, m) => s + m.principal, 0) : day.inflows - matOnDay.filter((m) => m.direction === "LEND").reduce((s, m) => s + m.principal, 0);
    const unit = p.ccy === "JPY" ? 100_000_000 : 1_000_000;
    specs.push({
      ref: `MMD-2026-00${4150 + i * 3}`,
      cp: p.cp,
      type: "TERM_DEPOSIT",
      dir: p.dir,
      ccy: p.ccy,
      principal: Math.max(unit, Math.floor((cap * 0.55) / unit) * unit),
      rate: BASE_RATE[p.ccy] + 0.0015,
      value,
      maturity: following(shiftDays(value, 182)),
      freq: "AT_MATURITY",
      status: "PENDING",
    });
  });

  // d) Recently matured deals: maturity inside the settled window, sized to fit that day.
  const used = new Set<string>();
  const matured: { dir: "LEND" | "BORROW"; ccy: Ccy }[] = [
    { dir: "BORROW", ccy: "USD" },
    { dir: "LEND", ccy: "USD" },
    { dir: "BORROW", ccy: "EUR" },
    { dir: "LEND", ccy: "EUR" },
    { dir: "BORROW", ccy: "GBP" },
    { dir: "LEND", ccy: "JPY" },
    { dir: "BORROW", ccy: "USD" },
    { dir: "LEND", ccy: "CHF" },
  ];
  matured.forEach((m, i) => {
    const past = aggPast[m.ccy];
    let best = -1;
    let bestCap = 0;
    for (let j = past.length - RECORD_WINDOW_DAYS + 1; j < past.length - 1; j++) {
      const d = past[j]!;
      if (!isBusinessDay(d.date) || used.has(`${m.ccy}${d.date}`)) continue;
      const cap = m.dir === "LEND" ? d.inflows : d.outflows; // principal received / repaid
      if (cap > bestCap) {
        bestCap = cap;
        best = j;
      }
    }
    const maturity = past[best]!.date;
    used.add(`${m.ccy}${maturity}`);
    const unit = m.ccy === "JPY" ? 100_000_000 : 1_000_000;
    const pool = active.filter((c) => (m.dir === "BORROW" ? c.funding > 0 : c.credit > 0));
    specs.push({
      ref: `MMD-2026-00${3300 + i * 7}`,
      cp: pool[Math.floor(rnd() * pool.length)]!.id,
      type: "TERM_DEPOSIT",
      dir: m.dir,
      ccy: m.ccy,
      principal: Math.max(unit, Math.floor((bestCap * 0.45) / unit) * unit),
      rate: BASE_RATE[m.ccy],
      value: prevBusinessDay(shiftDays(maturity, -91)),
      maturity,
      freq: "AT_MATURITY",
      status: "MATURED",
    });
  });

  // e) Cancelled before value date, and f) one that failed on its value date.
  [12, 20, 33].forEach((k, i) => {
    const value = following(shiftDays(T0, k));
    specs.push({ ref: `MMD-2026-00${4140 + i}`, cp: ["cp-14", "cp-21", "cp-09"][i]!, type: "TERM_DEPOSIT", dir: i === 1 ? "BORROW" : "LEND", ccy: (["USD", "EUR", "SGD"] as Ccy[])[i]!, principal: [60e6, 40e6, 25e6][i]!, rate: 0.04, value, maturity: following(shiftDays(value, 91)), freq: "AT_MATURITY", status: "CANCELLED" });
  });
  const failedValue = prevBusinessDay(shiftDays(T0, -6));
  specs.push({ ref: "MMD-2026-004104", cp: "cp-15", type: "TERM_DEPOSIT", dir: "LEND", ccy: "USD", principal: 30e6, rate: 0.0562, value: failedValue, maturity: following(shiftDays(failedValue, 61)), freq: "AT_MATURITY", status: "FAILED" });

  return specs;
}

/* ======================= main ======================= */

export function seedDb(): Db {
  const rnd = mulberry32(seedFor("db-market"));
  const { counterparties, ratingHistory, inactiveReferenced } = seedCounterparties();
  const fxRates = seedFx();

  const aggProj = Object.fromEntries(CURRENCIES.map((c) => [c, projectedFlows(c)])) as Record<Ccy, ReturnType<typeof projectedFlows>>;
  const aggPast = Object.fromEntries(CURRENCIES.map((c) => [c, actualFlows(c)])) as Record<Ccy, ReturnType<typeof actualFlows>>;

  /* ----- deals and schedule flows ----- */
  const deals: DealRecord[] = [];
  const cashFlows: CashFlowRecord[] = [];
  let cfSeq = 0;
  const cfRef = (date: string) => `CF-${date.replace(/-/g, "")}-${String(++cfSeq).padStart(5, "0")}`;

  dealSpecs(rnd, counterparties, aggProj, aggPast).forEach((s, i) => {
    const id = `dl-${String(i + 1).padStart(3, "0")}`;
    const dealDate = prevBusinessDay(shiftDays(s.value, rnd() < 0.5 ? 0 : -2));
    const deal: DealRecord = {
      id,
      deal_reference: s.ref,
      counterparty_id: s.cp,
      currency_code: s.ccy,
      deal_type: s.type,
      direction: s.dir,
      principal: s.principal.toFixed(minorUnits(s.ccy)),
      interest_rate: String(Number(s.rate.toFixed(6))),
      day_count: DEFAULT_DAY_COUNT[s.ccy]!,
      deal_date: dealDate > T0 ? T0 : dealDate,
      value_date: s.value,
      maturity_date: s.maturity,
      interest_frequency: s.freq,
      settlement_status: s.status,
      is_synthetic: true,
      ...meta(i + 60),
    };
    deals.push(deal);
    const sched = buildSchedule({ direction: s.dir, currency: s.ccy, principal: deal.principal, interest_rate: deal.interest_rate, day_count: deal.day_count, value_date: s.value, maturity_date: s.maturity, interest_frequency: s.freq });
    sched.flows.forEach((f, k) => {
      let status: CashFlowRecord["status"];
      if (s.status === "CANCELLED") status = "CANCELLED";
      else if (s.status === "FAILED") status = k === 0 ? "FAILED" : "CANCELLED";
      else status = f.date <= T0 ? "SETTLED" : "PROJECTED";
      cashFlows.push({
        id: `cf-${cfSeq + 1}`,
        transaction_reference: cfRef(f.date),
        deal_id: id,
        counterparty_id: s.cp,
        currency_code: s.ccy,
        direction: f.direction,
        category: f.kind,
        source: "DEAL_SCHEDULE",
        amount: f.amount,
        expected_date: f.date,
        settled_amount: status === "SETTLED" ? f.amount : null,
        actual_date: status === "SETTLED" ? f.date : null,
        status,
        is_synthetic: true,
        version: 1,
        ...(status === "FAILED" ? { note: "Counterparty did not deliver funds on the value date." } : {}),
      });
    });
  });

  /* ----- BAU flows: fill each day up to the designed daily totals ----- */
  const windowStart = shiftDays(T0, -(RECORD_WINDOW_DAYS - 1));
  const counting = new Map<string, { in: number; out: number }>(); // ccy|date -> deal amounts that count that day
  for (const f of cashFlows) {
    const date = f.status === "SETTLED" ? f.actual_date! : f.status === "PROJECTED" ? f.expected_date : null;
    if (!date) continue;
    const k = `${f.currency_code}|${date}`;
    const v = counting.get(k) ?? { in: 0, out: 0 };
    v[f.direction === "IN" ? "in" : "out"] += Number(f.amount);
    counting.set(k, v);
  }
  const customers = counterparties.filter((c) => c.is_active && ["CORPORATE", "FUND", "NBFI"].includes(c.counterparty_type));
  const pickWeighted = <T extends string>(w: [T, number][]): T => {
    let x = rnd() * w.reduce((s, [, n]) => s + n, 0);
    for (const [k, n] of w) if ((x -= n) <= 0) return k;
    return w[w.length - 1]![0];
  };
  const IN_CATS: [CashFlowCategory, number][] = [["CUSTOMER", 55], ["DEPOSIT", 25], ["COUPON", 10], ["FEE", 4], ["OTHER", 6]];
  const OUT_CATS: [CashFlowCategory, number][] = [["CUSTOMER", 45], ["DEPOSIT", 25], ["FEE", 5], ["TAX", 5], ["OTHER", 20]];

  const addBau = (ccy: Ccy, date: string, dir: "IN" | "OUT", total: number, settled: boolean) => {
    const minor = toMinor(total, ccy);
    if (minor <= 0) return;
    const n = 1 + Math.floor(rnd() * 3);
    const weights = Array.from({ length: n }, () => 0.4 + rnd());
    const wsum = weights.reduce((s, w) => s + w, 0);
    let left = minor;
    const day = Number(date.slice(8, 10));
    weights.forEach((w, i) => {
      const part = i === n - 1 ? left : Math.floor((minor * w) / wsum);
      left -= part;
      if (part <= 0) return;
      let category = pickWeighted(dir === "IN" ? IN_CATS : OUT_CATS);
      if (dir === "OUT" && i === 0 && day >= 24 && day <= 26) category = "PAYROLL";
      const amount = fromMinor(part, ccy);
      cashFlows.push({
        id: `cf-${cfSeq + 1}`,
        transaction_reference: cfRef(date),
        deal_id: null,
        counterparty_id: category === "CUSTOMER" && rnd() < 0.35 ? customers[Math.floor(rnd() * customers.length)]!.id : null,
        currency_code: ccy,
        direction: dir,
        category,
        source: "SYNTHETIC",
        amount,
        expected_date: date,
        settled_amount: settled ? amount : null,
        actual_date: settled ? date : null,
        status: settled ? "SETTLED" : "PROJECTED",
        is_synthetic: true,
        version: 1,
      });
    });
  };

  for (const c of CURRENCIES) {
    for (const d of aggPast[c]) {
      if (d.date < windowStart) continue;
      const deal = counting.get(`${c}|${d.date}`) ?? { in: 0, out: 0 };
      addBau(c, d.date, "IN", Math.max(0, d.inflows - deal.in), true);
      addBau(c, d.date, "OUT", Math.max(0, d.outflows - deal.out), true);
    }
    for (const d of aggProj[c]) {
      const deal = counting.get(`${c}|${d.date}`) ?? { in: 0, out: 0 };
      addBau(c, d.date, "IN", Math.max(0, d.inflows - deal.in), false);
      addBau(c, d.date, "OUT", Math.max(0, d.outflows - deal.out), false);
    }
  }

  // Overdue inflows: expected but not received (excluded from projections, §5.4).
  (
    [
      { ccy: "USD", amount: "6200000.00", cp: "cp-13", back: 2 },
      { ccy: "GBP", amount: "2500000.00", cp: "cp-05", back: 4 },
      { ccy: "EUR", amount: "3000000.00", cp: "cp-15", back: 6 },
    ] as const
  ).forEach((o) => {
    let date = T0;
    for (let n = 0; n < o.back; ) {
      date = shiftDays(date, -1);
      if (isBusinessDay(date)) n++;
    }
    cashFlows.push({ id: `cf-${cfSeq + 1}`, transaction_reference: cfRef(date), deal_id: null, counterparty_id: o.cp, currency_code: o.ccy, direction: "IN", category: "CUSTOMER", source: "SYNTHETIC", amount: o.amount, expected_date: date, settled_amount: null, actual_date: null, status: "PROJECTED", is_synthetic: true, version: 1 });
  });

  // Old settled flows for the inactive-but-referenced counterparties (before the window).
  inactiveReferenced.forEach((cp, i) => {
    const date = prevBusinessDay(shiftDays(T0, -210 - i * 9));
    cashFlows.push({ id: `cf-${cfSeq + 1}`, transaction_reference: cfRef(date), deal_id: null, counterparty_id: cp, currency_code: "GBP", direction: "IN", category: "CUSTOMER", source: "SYNTHETIC", amount: (850_000 + i * 120_000).toFixed(2), expected_date: date, settled_amount: (850_000 + i * 120_000).toFixed(2), actual_date: date, status: "SETTLED", is_synthetic: true, version: 1 });
  });

  /* ----- cash accounts: opening balance solved so Cash(T0) matches (§5.5) ----- */
  const openingDate = shiftDays(T0, -RECORD_WINDOW_DAYS);
  const cashAccounts: CashAccountRecord[] = CURRENCIES.map((c, i) => {
    let net = 0;
    for (const f of cashFlows) {
      if (f.currency_code !== c || f.status !== "SETTLED" || !f.actual_date || f.actual_date <= openingDate || f.actual_date > T0) continue;
      net += (f.direction === "IN" ? 1 : -1) * toMinor(Number(f.settled_amount), c);
    }
    const reserve = c === "USD" || c === "EUR";
    return {
      id: `ca-${c.toLowerCase()}`,
      currency_code: c,
      name: reserve ? `${c} central bank reserve account` : `${c} nostro account`,
      account_type: reserve ? "CENTRAL_BANK_RESERVE" : "NOSTRO",
      opening_balance: fromMinor(toMinor(OPENING[c].cash, c) - net, c),
      opening_date: openingDate,
      ...meta(i + 100),
    };
  });

  /* ----- liquid assets: unencumbered liquidity value per currency matches the buffer ----- */
  const SEC_PLAN: Record<Ccy, AssetClass[]> = {
    USD: ["GOVT_BOND", "GOVT_BOND", "GOVT_BOND", "SUPRANATIONAL", "COVERED_BOND", "CORPORATE_BOND", "CORPORATE_BOND"],
    EUR: ["GOVT_BOND", "GOVT_BOND", "SUPRANATIONAL", "COVERED_BOND", "COVERED_BOND", "CORPORATE_BOND"],
    GBP: ["GOVT_BOND", "GOVT_BOND", "SUPRANATIONAL", "CORPORATE_BOND"],
    JPY: ["GOVT_BOND", "GOVT_BOND", "GOVT_BOND"],
    CHF: ["GOVT_BOND", "COVERED_BOND"],
    AUD: ["GOVT_BOND", "SUPRANATIONAL"],
    SGD: ["GOVT_BOND", "GOVT_BOND"],
  };
  const coveredIssuers = ["cp-01", "cp-02", "cp-10", "cp-18", "cp-23"];
  const corpIssuers = ["cp-06", "cp-13", "cp-28", "cp-29", "cp-36"];
  const liquidAssets: LiquidAssetRecord[] = [];
  let secN = 0;
  const secId = (ccy: Ccy) => `SY${ccy}${String(4_810_000 + ++secN * 7_919).slice(0, 6)}${secN % 10}`;
  const issuerName = (id: string) => counterparties.find((c) => c.id === id)!.name;
  const secName = (cls: AssetClass, ccy: Ccy, issuer: string | null, coupon: number, year: number) => {
    const cp = `${coupon.toFixed(2)}% ${year}`;
    if (cls === "GOVT_BOND") return `${ccy} Govt ${cp}`;
    if (cls === "SUPRANATIONAL") return `Intl Development Bank ${cp}`;
    return `${issuerName(issuer!)} ${cls === "COVERED_BOND" ? "covered " : ""}${cp}`;
  };
  const addSecurity = (ccy: Ccy, cls: AssetClass, mv: number, encumbered: boolean) => {
    const issuer = cls === "COVERED_BOND" ? coveredIssuers[secN % coveredIssuers.length]! : cls === "CORPORATE_BOND" ? corpIssuers[secN % corpIssuers.length]! : null;
    const year = 2027 + Math.floor(rnd() * 7);
    liquidAssets.push({
      id: `la-${String(liquidAssets.length + 1).padStart(3, "0")}`,
      security_id: secId(ccy),
      name: secName(cls, ccy, issuer, BASE_RATE[ccy] * 100 + rnd() * 1.5, year),
      asset_class: cls,
      currency_code: ccy,
      issuer_counterparty_id: issuer,
      market_value: fromMinor(toMinor(mv, ccy), ccy),
      haircut: DEFAULT_HAIRCUT[cls],
      is_encumbered: encumbered,
      maturity_date: following(`${year}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-15`),
      is_synthetic: true,
      ...meta(liquidAssets.length + 120),
    });
  };
  for (const c of CURRENCIES) {
    const classes = SEC_PLAN[c];
    const target = OPENING[c].securities;
    const weights = classes.map((cls) => (cls === "GOVT_BOND" ? 1.6 : 0.7) * (0.6 + rnd()));
    const wsum = weights.reduce((s, w) => s + w, 0);
    let lvLeft = target;
    classes.forEach((cls, i) => {
      const h = Number(DEFAULT_HAIRCUT[cls]);
      const lv = i === classes.length - 1 ? lvLeft : (target * weights[i]!) / wsum;
      lvLeft -= lv;
      addSecurity(c, cls, lv / (1 - h), false);
    });
    if (c === "USD" || c === "EUR" || c === "GBP") addSecurity(c, c === "EUR" ? "COVERED_BOND" : "GOVT_BOND", target * (0.1 + rnd() * 0.06), true);
  }

  /* ----- funding sources ----- */
  const cpByName = (name: string) => counterparties.find((c) => c.name === name)!.id;
  const fs = (name: string, funding_type: FundingSourceRecord["funding_type"], currency_code: Ccy, counterparty_id: string | null, available: number, utilized: number, maturity: string | null): FundingSourceRecord => ({
    id: `fs-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`,
    name,
    funding_type,
    currency_code,
    counterparty_id,
    available_amount: available.toFixed(minorUnits(currency_code)),
    utilized_amount: utilized.toFixed(minorUnits(currency_code)),
    maturity_date: maturity,
    is_synthetic: true,
    ...meta(available % 97),
  });
  const fundingSources: FundingSourceRecord[] = [
    fs("Retail deposits USD", "RETAIL_DEPOSITS", "USD", null, 1_450e6, 1_450e6, null),
    fs("Retail deposits EUR", "RETAIL_DEPOSITS", "EUR", null, 620e6, 620e6, null),
    fs("Retail deposits GBP", "RETAIL_DEPOSITS", "GBP", null, 310e6, 310e6, null),
    fs("Corporate deposits USD", "CORPORATE_DEPOSITS", "USD", null, 540e6, 540e6, null),
    fs("Corporate deposits EUR", "CORPORATE_DEPOSITS", "EUR", null, 280e6, 280e6, null),
    fs("Corporate deposits SGD", "CORPORATE_DEPOSITS", "SGD", null, 95e6, 95e6, null),
    // Committed headroom per currency equals OPENING.facilities (250m USD, 100m EUR).
    fs("Northbridge revolving facility", "COMMITTED_LINE", "USD", "cp-01", 400e6, 150e6, following(shiftDays(T0, 410))),
    fs("Kestrel committed EUR line", "COMMITTED_LINE", "EUR", "cp-10", 150e6, 50e6, following(shiftDays(T0, 290))),
    fs("Ironbridge GBP overdraft", "UNCOMMITTED_LINE", "GBP", cpByName("Ironbridge Commercial Bank"), 100e6, 20e6, null),
    fs("Coral Bay AUD money line", "UNCOMMITTED_LINE", "AUD", "cp-07", 60e6, 0, null),
    fs("Sakura JPY repo facility", "REPO_FACILITY", "JPY", "cp-11", 30_000e6, 12_000e6, following(shiftDays(T0, 180))),
    fs("Central bank standing facility USD", "CENTRAL_BANK_FACILITY", "USD", null, 500e6, 0, null),
    fs("Central bank standing facility EUR", "CENTRAL_BANK_FACILITY", "EUR", null, 300e6, 0, null),
  ];

  /* ----- manual currency exposures (positions not captured elsewhere, A2) ----- */
  const ex = (i: number, currency_code: Ccy, exposure_type: ExposureRecord["exposure_type"], position: ExposureRecord["position"], amount: number, valueIn: number | null, counterparty_id: string | null, description: string): ExposureRecord => ({
    id: `ex-${String(i).padStart(3, "0")}`,
    currency_code,
    exposure_type,
    position,
    exposure_amount: amount.toFixed(minorUnits(currency_code)),
    value_date: valueIn === null ? null : following(shiftDays(T0, valueIn)),
    counterparty_id,
    description,
    is_synthetic: true,
    ...meta(i + 160),
  });
  const exposures: ExposureRecord[] = [
    ex(1, "EUR", "FX_FORWARD", "LONG", 45e6, 30, "cp-10", "Buy EUR forward against USD to fund EUR placements"),
    ex(2, "GBP", "FX_FORWARD", "SHORT", 30e6, 60, cpByName("Ironbridge Commercial Bank"), "Sell GBP forward to repatriate the GBP surplus"),
    ex(3, "JPY", "FX_FORWARD", "SHORT", 4_000e6, 91, "cp-11", "Hedge of JPY repo funding"),
    ex(4, "CHF", "FX_SPOT", "LONG", 12e6, 2, "cp-02", "Spot purchase ahead of a CHF deposit maturity"),
    ex(5, "AUD", "FX_SPOT", "SHORT", 8e6, 2, "cp-07", "Spot sale of AUD receipts"),
    ex(6, "SGD", "FX_FORWARD", "LONG", 20e6, 45, cpByName("Lotus Bay Bank"), "Buy SGD forward for corporate deposit outflows"),
    ex(7, "CHF", "FX_FORWARD", "SHORT", 15e6, 120, cpByName("Kingsgate Private Bank"), "Sell CHF forward, matching a CHF placement maturity"),
    ex(8, "AUD", "FX_FORWARD", "LONG", 10e6, 75, cpByName("Riverstone Securities"), "Buy AUD forward for a client settlement"),
    ex(9, "GBP", "OFF_BALANCE_SHEET", "SHORT", 6e6, null, cpByName("Ashford Logistics Holdings"), "Letter of credit issued on behalf of a client"),
    ex(10, "EUR", "OFF_BALANCE_SHEET", "LONG", 4e6, null, cpByName("Larkspur Retail Group"), "Documentary credit receivable"),
    ex(11, "EUR", "OFF_BALANCE_SHEET", "SHORT", 9.5e6, null, "cp-13", "Performance guarantee issued"),
    ex(12, "SGD", "OTHER", "LONG", 1.2e6, null, null, "Accrued fee income"),
    ex(13, "EUR", "OTHER", "SHORT", 3.4e6, 35, null, "Corporate tax payable"),
    ex(14, "JPY", "FX_SPOT", "LONG", 650e6, 2, "cp-11", "Spot purchase to pre-fund JPY repo interest"),
  ];

  return {
    schema: SCHEMA,
    counterparties,
    ratingHistory,
    deals,
    cashFlows,
    cashAccounts,
    fundingSources,
    liquidAssets,
    exposures,
    fxRates,
    audit: [],
    seq: 1000,
  };
}
