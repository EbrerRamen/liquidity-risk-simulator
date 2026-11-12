/**
 * Deterministic synthetic data behind the dashboard mocks.
 *
 * Flows are generated per currency (seeded), then converted to the base
 * currency at fixed rates, so the consolidated view and every single-currency
 * view always reconcile. Generation is plain numbers; the mock API layer
 * converts results to decimal strings, as the real API returns them.
 *
 * Sign convention (TECHNICAL_PLAN §5.2): stored amounts are positive and the
 * direction gives the sign.
 */

export const BUSINESS_DATE = "2026-11-12";
export const BASE_CCY = "USD";
export const MIN_BUFFER_BASE = 600_000_000; // app_settings.min_buffer, base currency

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "SGD"] as const;
export type Ccy = (typeof CURRENCIES)[number];

/** Base units per 1 unit of currency, as of the business date (S_c(T0)). */
export const FX: Record<Ccy, number> = {
  USD: 1,
  EUR: 1.0842,
  GBP: 1.2716,
  JPY: 0.006618,
  CHF: 1.1235,
  AUD: 0.6531,
  SGD: 0.7458,
};

/** Each currency's share of activity, in base terms. */
const SHARE: Record<Ccy, number> = { USD: 0.46, EUR: 0.22, GBP: 0.12, JPY: 0.08, CHF: 0.055, AUD: 0.04, SGD: 0.025 };

/* ---------- seeded PRNG ---------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFor(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/* ---------- dates ---------- */

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isWeekend(iso: string): boolean {
  const day = new Date(iso + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

/* ---------- counterparties ---------- */

export type CounterpartyType = "BANK" | "CORPORATE" | "FUND" | "SOVEREIGN" | "NBFI";
export type Band = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Counterparty {
  id: string;
  name: string;
  type: CounterpartyType;
  country: string;
  /** Analyst-assigned classification (A5). */
  classification: Band;
  /** Latest model assessment band (A13). */
  modelBand: Band;
  /** Funding provided, base currency (BORROW principal + utilised funding). */
  funding: number;
  /** Credit exposure, base currency (LEND principal + securities issued). */
  credit: number;
}

export const COUNTERPARTIES: Counterparty[] = [
  { id: "cp-01", name: "Northbridge Capital Bank", type: "BANK", country: "GB", classification: "MEDIUM", modelBand: "MEDIUM", funding: 1_284_000_000, credit: 310_000_000 },
  { id: "cp-02", name: "Helvetia Savings AG", type: "BANK", country: "CH", classification: "LOW", modelBand: "LOW", funding: 846_000_000, credit: 420_000_000 },
  { id: "cp-03", name: "Pacific Rim Trust", type: "BANK", country: "SG", classification: "LOW", modelBand: "HIGH", funding: 702_000_000, credit: 155_000_000 },
  { id: "cp-04", name: "Meridian Asset Partners", type: "FUND", country: "US", classification: "MEDIUM", modelBand: "MEDIUM", funding: 618_000_000, credit: 92_000_000 },
  { id: "cp-05", name: "Thames Merchant Finance", type: "NBFI", country: "GB", classification: "HIGH", modelBand: "CRITICAL", funding: 455_000_000, credit: 268_000_000 },
  { id: "cp-06", name: "Rhein Industrie Holding", type: "CORPORATE", country: "DE", classification: "LOW", modelBand: "LOW", funding: 392_000_000, credit: 140_000_000 },
  { id: "cp-07", name: "Coral Bay Securities", type: "NBFI", country: "AU", classification: "MEDIUM", modelBand: "HIGH", funding: 341_000_000, credit: 77_000_000 },
  { id: "cp-08", name: "Atlas Mutual Fund", type: "FUND", country: "US", classification: "LOW", modelBand: "LOW", funding: 298_000_000, credit: 0 },
  { id: "cp-09", name: "Lumen Treasury Services", type: "CORPORATE", country: "NL", classification: "LOW", modelBand: "MEDIUM", funding: 246_000_000, credit: 118_000_000 },
  { id: "cp-10", name: "Kestrel Privatbank", type: "BANK", country: "DE", classification: "MEDIUM", modelBand: "MEDIUM", funding: 214_000_000, credit: 402_000_000 },
  { id: "cp-11", name: "Sakura Shinkin Bank", type: "BANK", country: "JP", classification: "LOW", modelBand: "LOW", funding: 187_000_000, credit: 233_000_000 },
  { id: "cp-12", name: "Republic of Valoria", type: "SOVEREIGN", country: "VL", classification: "LOW", modelBand: "LOW", funding: 0, credit: 612_000_000 },
  { id: "cp-13", name: "Granite Peak Energy", type: "CORPORATE", country: "CA", classification: "HIGH", modelBand: "HIGH", funding: 126_000_000, credit: 189_000_000 },
  { id: "cp-14", name: "Orchid Capital Markets", type: "NBFI", country: "SG", classification: "MEDIUM", modelBand: "MEDIUM", funding: 109_000_000, credit: 64_000_000 },
  { id: "cp-15", name: "Baltic Shipping Credit", type: "NBFI", country: "LV", classification: "HIGH", modelBand: "CRITICAL", funding: 84_000_000, credit: 141_000_000 },
  { id: "cp-16", name: "Others (33 counterparties)", type: "CORPORATE", country: "--", classification: "LOW", modelBand: "LOW", funding: 912_000_000, credit: 1_204_000_000 },
];

/** Portfolio counts by band (48 counterparties in total). */
export const BAND_COUNTS = {
  analyst: { LOW: 22, MEDIUM: 14, HIGH: 9, CRITICAL: 3 },
  model: { LOW: 19, MEDIUM: 15, HIGH: 10, CRITICAL: 4 },
  disagreements: 5,
};

export const ANOMALIES_BY_TYPE = [
  { type: "AMOUNT_OUTLIER", label: "Unusual amount", open: 4, total: 11 },
  { type: "TIMING", label: "Unusual timing", open: 3, total: 7 },
  { type: "COUNTERPARTY_BEHAVIOUR", label: "Counterparty behaviour", open: 2, total: 5 },
  { type: "DUPLICATE", label: "Possible duplicate", open: 1, total: 3 },
];

/* ---------- deals maturing in the horizon (lumpy principal flows) ---------- */

export interface MaturingDeal {
  reference: string;
  counterpartyId: string;
  dealType: "TERM_DEPOSIT" | "CALL_MONEY" | "REPO" | "TERM_PLACEMENT" | "COMMERCIAL_PAPER";
  direction: "LEND" | "BORROW";
  currency: Ccy;
  principal: number; // in deal currency
  rate: number;
  day: number; // maturity = T0 + day
}

/** Principal maturities. BORROW = principal repaid (outflow), LEND = principal received (inflow). */
export const MATURITIES: MaturingDeal[] = [
  { reference: "MMD-2026-004131", counterpartyId: "cp-02", dealType: "CALL_MONEY", direction: "LEND", currency: "CHF", principal: 80_000_000, rate: 0.011, day: 1 },
  { reference: "MMD-2026-003988", counterpartyId: "cp-04", dealType: "TERM_DEPOSIT", direction: "BORROW", currency: "USD", principal: 145_000_000, rate: 0.0518, day: 4 },
  { reference: "MMD-2026-004127", counterpartyId: "cp-01", dealType: "TERM_DEPOSIT", direction: "BORROW", currency: "USD", principal: 250_000_000, rate: 0.0525, day: 7 },
  { reference: "MMD-2026-004002", counterpartyId: "cp-10", dealType: "TERM_PLACEMENT", direction: "LEND", currency: "EUR", principal: 120_000_000, rate: 0.0341, day: 8 },
  { reference: "MMD-2026-003871", counterpartyId: "cp-05", dealType: "REPO", direction: "BORROW", currency: "GBP", principal: 160_000_000, rate: 0.0476, day: 11 },
  { reference: "MMD-2026-003902", counterpartyId: "cp-01", dealType: "TERM_DEPOSIT", direction: "BORROW", currency: "USD", principal: 380_000_000, rate: 0.0531, day: 14 },
  { reference: "MMD-2026-004056", counterpartyId: "cp-12", dealType: "COMMERCIAL_PAPER", direction: "LEND", currency: "USD", principal: 90_000_000, rate: 0.0498, day: 15 },
  { reference: "MMD-2026-004098", counterpartyId: "cp-03", dealType: "REPO", direction: "BORROW", currency: "JPY", principal: 21_500_000_000, rate: -0.001, day: 20 },
  { reference: "MMD-2026-003955", counterpartyId: "cp-07", dealType: "TERM_DEPOSIT", direction: "BORROW", currency: "AUD", principal: 210_000_000, rate: 0.0431, day: 21 },
  { reference: "MMD-2026-003790", counterpartyId: "cp-02", dealType: "TERM_DEPOSIT", direction: "BORROW", currency: "CHF", principal: 175_000_000, rate: 0.0095, day: 22 },
  { reference: "MMD-2026-004011", counterpartyId: "cp-11", dealType: "TERM_PLACEMENT", direction: "LEND", currency: "JPY", principal: 9_000_000_000, rate: 0.0012, day: 27 },
  { reference: "MMD-2026-003812", counterpartyId: "cp-06", dealType: "TERM_PLACEMENT", direction: "LEND", currency: "EUR", principal: 260_000_000, rate: 0.0336, day: 29 },
  { reference: "MMD-2026-003744", counterpartyId: "cp-04", dealType: "TERM_DEPOSIT", direction: "BORROW", currency: "USD", principal: 230_000_000, rate: 0.0522, day: 36 },
  { reference: "MMD-2026-003699", counterpartyId: "cp-10", dealType: "TERM_PLACEMENT", direction: "LEND", currency: "EUR", principal: 310_000_000, rate: 0.0329, day: 43 },
  { reference: "MMD-2026-003655", counterpartyId: "cp-09", dealType: "TERM_DEPOSIT", direction: "BORROW", currency: "EUR", principal: 140_000_000, rate: 0.0318, day: 50 },
  { reference: "MMD-2026-003620", counterpartyId: "cp-12", dealType: "COMMERCIAL_PAPER", direction: "LEND", currency: "USD", principal: 400_000_000, rate: 0.0491, day: 57 },
  { reference: "MMD-2026-003588", counterpartyId: "cp-01", dealType: "TERM_DEPOSIT", direction: "BORROW", currency: "GBP", principal: 200_000_000, rate: 0.0469, day: 64 },
  { reference: "MMD-2026-003541", counterpartyId: "cp-13", dealType: "TERM_PLACEMENT", direction: "LEND", currency: "USD", principal: 150_000_000, rate: 0.0612, day: 71 },
  { reference: "MMD-2026-003502", counterpartyId: "cp-03", dealType: "REPO", direction: "BORROW", currency: "SGD", principal: 260_000_000, rate: 0.0298, day: 78 },
  { reference: "MMD-2026-003467", counterpartyId: "cp-05", dealType: "TERM_PLACEMENT", direction: "LEND", currency: "GBP", principal: 180_000_000, rate: 0.0505, day: 85 },
];

/* ---------- daily flows ---------- */

export interface DayFlows {
  date: string;
  inflows: number;
  outflows: number;
}

/**
 * Projected contractual flows for one currency, days 1..90 after T0, in that
 * currency. Business-as-usual flows plus principal maturities. Overdue outflows
 * would land on day 1; overdue inflows are excluded (memo item, §5.4).
 */
export function projectedFlows(ccy: Ccy): DayFlows[] {
  const rnd = mulberry32(seedFor("proj-" + ccy));
  const scale = (SHARE[ccy] * 1_000_000) / FX[ccy];
  const out: DayFlows[] = [];
  for (let t = 1; t <= 90; t++) {
    const date = addDays(BUSINESS_DATE, t);
    let inflows = 0;
    let outflows = 0;
    if (!isWeekend(date)) {
      inflows = (38 + rnd() * 34) * scale; // client receipts, coupons, interest
      outflows = (44 + rnd() * 36) * scale; // payments, interest, operating
    }
    for (const m of MATURITIES) {
      if (m.currency === ccy && m.day === t) {
        if (m.direction === "LEND") inflows += m.principal;
        else outflows += m.principal;
      }
    }
    out.push({ date, inflows, outflows });
  }
  return out;
}

/** Settled (actual) flows for one currency over the 180 days up to and including T0. */
export function actualFlows(ccy: Ccy): DayFlows[] {
  const rnd = mulberry32(seedFor("hist-" + ccy));
  const scale = (SHARE[ccy] * 1_000_000) / FX[ccy];
  const out: DayFlows[] = [];
  for (let t = -179; t <= 0; t++) {
    const date = addDays(BUSINESS_DATE, t);
    let inflows = 0;
    let outflows = 0;
    if (!isWeekend(date)) {
      const season = 1 + 0.18 * Math.sin((t / 30) * Math.PI); // month-end pattern
      inflows = (42 + rnd() * 40) * scale * season;
      outflows = (41 + rnd() * 40) * scale;
      if (rnd() < 0.06) inflows += (180 + rnd() * 220) * scale; // occasional maturity received
      if (rnd() < 0.06) outflows += (170 + rnd() * 230) * scale; // occasional maturity repaid
    }
    out.push({ date, inflows, outflows });
  }
  // A treasury steers its cash: each business day it sweeps part of the gap to a
  // target level (funding shortfalls, placing surpluses), and the last day lands
  // exactly on today's opening cash. Sweeps are booked as flows, so the flows
  // chart and the cash history (rebuilt from flows) stay consistent.
  const end = OPENING[ccy].cash;
  const startCash = end * 1.08;
  let cash = startCash;
  out.forEach((d, i) => {
    cash += d.inflows - d.outflows;
    const target = startCash + ((end - startCash) * (i + 1)) / out.length;
    const isLast = i === out.length - 1;
    if (isWeekend(d.date) && !isLast) return;
    const sweep = isLast ? end - cash : 0.35 * (target - cash);
    if (sweep >= 0) d.inflows += sweep;
    else d.outflows -= sweep;
    cash += sweep;
  });
  return out;
}

/** Opening position at end of T0, per currency, in that currency (§5.5). */
export const OPENING: Record<Ccy, { cash: number; securities: number; facilities: number }> = {
  USD: { cash: 352_000_000, securities: 548_000_000, facilities: 250_000_000 },
  EUR: { cash: 128_000_000, securities: 243_000_000, facilities: 100_000_000 },
  GBP: { cash: 61_000_000, securities: 88_000_000, facilities: 0 },
  JPY: { cash: 6_900_000_000, securities: 14_100_000_000, facilities: 0 },
  CHF: { cash: 38_000_000, securities: 46_000_000, facilities: 0 },
  AUD: { cash: 52_000_000, securities: 39_000_000, facilities: 0 },
  SGD: { cash: 31_000_000, securities: 24_000_000, facilities: 0 },
};

/** Inflows already past their expected date but not received (memo, excluded from projections). */
export const OVERDUE_INFLOWS = { count: 3, amountBase: 12_640_000 };

/** Previous business day values for KPI deltas. */
export const PREVIOUS = { availableLiquidityBase: 1_804_600_000, slci30: 1.18 };

export const ACTIVE_SCENARIOS = 6;
