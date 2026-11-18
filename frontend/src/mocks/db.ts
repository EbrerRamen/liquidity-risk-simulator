/**
 * The mock "database": one live, seeded store shared by every mock endpoint,
 * so the dashboard and the data screens always agree. It persists in
 * sessionStorage (per tab), so edits survive a reload, like the mock session.
 *
 * Seed: the 15 named counterparties behind the dashboard plus 33 generated
 * active ones (48 active in total) and 4 inactive ones.
 */
import type { Audited } from "@/api/types";
import { BUSINESS_DATE, MATURITIES, NAMED_COUNTERPARTIES, OTHERS_TOTALS, addDays, mulberry32, seedFor } from "./dashboard-data";
import { RATINGS, type Band, type CounterpartyType, type Rating } from "./reference";

export interface CounterpartyRecord extends Audited {
  id: string;
  name: string;
  counterparty_type: CounterpartyType;
  country_code: string;
  credit_rating: Rating;
  risk_classification: Band; // analyst-assigned (A5)
  is_active: boolean;
  is_synthetic: boolean;
  // Read-side data the real backend derives from other tables (deals, flows,
  // funding, risk_assessments). Stored here only to keep the mock simple.
  model_band: Band | null;
  model_score: number | null;
  assessed_at: string | null;
  funding: number; // base currency
  credit: number; // base currency
  open_deals: number;
  cash_flows: number;
  payment: { settled: number; on_time_rate: number; avg_delay_days: number; failed: number };
}

export interface RatingHistoryRecord {
  id: number;
  counterparty_id: string;
  credit_rating: Rating;
  effective_date: string;
}

export interface AuditRecord {
  id: number;
  at: string;
  actor: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "LOGIN";
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes?: Record<string, [unknown, unknown]>;
}

interface Db {
  schema: number;
  counterparties: CounterpartyRecord[];
  ratingHistory: RatingHistoryRecord[];
  audit: AuditRecord[];
  seq: number;
}

const SCHEMA = 1;
const KEY = "lrs.mock.db";

/* ---------- seed ---------- */

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

/** Analyst classification for the 33 generated active names (model agrees for these). */
const OTHER_BANDS: Band[] = [
  ...Array<Band>(15).fill("LOW"),
  ...Array<Band>(9).fill("MEDIUM"),
  ...Array<Band>(6).fill("HIGH"),
  ...Array<Band>(3).fill("CRITICAL"),
];

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

function seedDb(): Db {
  const rnd = mulberry32(seedFor("db-counterparties"));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const score = (b: Band) => {
    const [lo, hi] = SCORE_RANGE[b];
    return Math.round(lo + rnd() * (hi - lo));
  };
  const created = (i: number) => new Date(Date.UTC(2024, 1 + (i % 20), 3 + ((i * 7) % 24), 9, 0)).toISOString();
  const payment = (b: Band, n: number) => ({
    settled: n,
    on_time_rate: { LOW: 0.985, MEDIUM: 0.955, HIGH: 0.9, CRITICAL: 0.81 }[b] - rnd() * 0.02,
    avg_delay_days: { LOW: 0.1, MEDIUM: 0.4, HIGH: 1.3, CRITICAL: 2.8 }[b] + rnd() * 0.4,
    failed: b === "CRITICAL" ? 2 + Math.floor(rnd() * 3) : b === "HIGH" ? Math.floor(rnd() * 2) : 0,
  });

  const counterparties: CounterpartyRecord[] = [];

  NAMED_COUNTERPARTIES.forEach((c, i) => {
    const open = MATURITIES.filter((m) => m.counterpartyId === c.id).length + 1 + Math.floor(rnd() * 4);
    const flows = open * 4 + 20 + Math.floor(rnd() * 60);
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
      assessed_at: BUSINESS_DATE,
      funding: c.funding,
      credit: c.credit,
      open_deals: open,
      cash_flows: flows,
      payment: payment(c.modelBand, flows - open * 2),
      version: 1 + Math.floor(rnd() * 4),
      created_at: created(i),
      updated_at: new Date(Date.UTC(2026, 9, 1 + Math.floor(rnd() * 40), 10)).toISOString(),
      created_by: null,
      updated_by: null,
    });
  });

  const bands = shuffle(OTHER_BANDS, rnd);
  const fundingW = OTHER_NAMES.map((o) => (o.type === "CENTRAL_BANK" ? 0 : 0.3 + rnd()));
  const creditW = OTHER_NAMES.map(() => 0.2 + rnd());
  const fundings = split(OTHERS_TOTALS.funding, fundingW);
  const credits = split(OTHERS_TOTALS.credit, creditW);

  OTHER_NAMES.forEach((o, i) => {
    const band = o.type === "CENTRAL_BANK" ? "LOW" : bands[i]!;
    const open = Math.floor(rnd() * 5);
    const flows = open * 4 + Math.floor(rnd() * 40) + 6;
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
      assessed_at: BUSINESS_DATE,
      funding: fundings[i]!,
      credit: credits[i]!,
      open_deals: open,
      cash_flows: flows,
      payment: payment(band, flows - open * 2),
      version: 1 + Math.floor(rnd() * 3),
      created_at: created(i + 15),
      updated_at: new Date(Date.UTC(2026, 6 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 27), 10)).toISOString(),
      created_by: null,
      updated_by: null,
    });
  });

  INACTIVE.forEach((o, i) => {
    counterparties.push({
      id: `cp-${String(i + 50).padStart(2, "0")}`,
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
      open_deals: 0,
      cash_flows: o.referenced ? 12 + Math.floor(rnd() * 30) : 0,
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
      entries.push({ id: 0, counterparty_id: c.id, credit_rating: RATINGS[idx]!, effective_date: addDays(BUSINESS_DATE, -daysBack) });
      idx = Math.max(0, Math.min(RATINGS.length - 1, idx + (rnd() < 0.5 ? -1 : 1)));
    }
    for (const e of entries.reverse()) ratingHistory.push({ ...e, id: rid++ });
  }

  return { schema: SCHEMA, counterparties, ratingHistory, audit: [], seq: 1000 };
}

/* ---------- live store ---------- */

let cache: Db | null = null;

export function db(): Db {
  if (cache) return cache;
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Db) : null;
    if (parsed && parsed.schema === SCHEMA) return (cache = parsed);
  } catch {
    /* fall through to a fresh seed */
  }
  return (cache = seedDb());
}

export function commit(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(db()));
  } catch {
    /* storage unavailable: changes last until reload */
  }
}

export function resetDb(): void {
  cache = seedDb();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function nextId(prefix: string): string {
  const d = db();
  d.seq += 1;
  return `${prefix}-${d.seq}`;
}

export function audit(entry: Omit<AuditRecord, "id" | "at">): void {
  const d = db();
  d.audit.unshift({ ...entry, id: d.audit.length + 1, at: new Date().toISOString() });
}

export const nowIso = () => new Date().toISOString();

// Development hooks for automated UI checks (never shipped in production builds).
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __lrsMock: unknown }).__lrsMock = {
    reset: () => {
      resetDb();
      commit();
    },
    /** Simulate another user editing a record (optimistic-locking demo). */
    touchCounterparty: (id: string) => {
      const c = db().counterparties.find((x) => x.id === id);
      if (c) {
        c.version += 1;
        c.updated_at = nowIso();
        c.updated_by = "Alex Admin";
        commit();
      }
    },
  };
}
