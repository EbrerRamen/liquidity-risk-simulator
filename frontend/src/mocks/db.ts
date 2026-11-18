/**
 * The mock "database": one live, seeded store shared by every mock endpoint, so
 * the dashboard and the data screens always agree. It persists in
 * sessionStorage (per tab), so edits survive a reload, like the mock session.
 *
 * Tables mirror TECHNICAL_PLAN §3.2. The seed (./seed.ts) is built so that the
 * dashboard's figures come out of these records via the §5 formulas.
 */
import type { Audited } from "@/api/types";
import type {
  AccountType,
  AssetClass,
  Band,
  CashFlowCategory,
  CashFlowSource,
  CashFlowStatus,
  CounterpartyType,
  CurrencyCode,
  DayCountCode,
  DealStatus,
  DealType,
  ExposureType,
  FundingType,
  InterestFrequency,
  Position,
  Rating,
} from "./reference";
import { SCHEMA, seedDb } from "./seed";

export interface CounterpartyRecord extends Audited {
  id: string;
  name: string;
  counterparty_type: CounterpartyType;
  country_code: string;
  credit_rating: Rating;
  risk_classification: Band; // analyst-assigned (A5)
  is_active: boolean;
  is_synthetic: boolean;
  // Read-side data the real backend derives from other tables (funding,
  // risk_assessments, payment history). Stored here to keep the mock simple.
  model_band: Band | null;
  model_score: number | null;
  assessed_at: string | null;
  funding: number; // base currency
  credit: number; // base currency
  payment: { settled: number; on_time_rate: number; avg_delay_days: number; failed: number };
}

export interface RatingHistoryRecord {
  id: number;
  counterparty_id: string;
  credit_rating: Rating;
  effective_date: string;
}

export interface DealRecord extends Audited {
  id: string;
  deal_reference: string;
  counterparty_id: string;
  currency_code: CurrencyCode;
  deal_type: DealType;
  direction: "LEND" | "BORROW";
  principal: string;
  interest_rate: string; // annual fraction
  day_count: DayCountCode;
  deal_date: string;
  value_date: string;
  maturity_date: string;
  interest_frequency: InterestFrequency;
  settlement_status: DealStatus;
  is_synthetic: boolean;
}

/** Seeded flows omit audit timestamps to keep the persisted store small; reads fill defaults. */
export interface CashFlowRecord extends Partial<Omit<Audited, "version">> {
  id: string;
  transaction_reference: string;
  deal_id: string | null;
  counterparty_id: string | null;
  currency_code: CurrencyCode;
  direction: "IN" | "OUT";
  category: CashFlowCategory;
  source: CashFlowSource;
  amount: string;
  expected_date: string;
  settled_amount: string | null;
  actual_date: string | null;
  status: CashFlowStatus;
  is_synthetic: boolean;
  version: number;
  /** Free-text note recorded on settlement or failure. */
  note?: string;
}

export interface CashAccountRecord extends Audited {
  id: string;
  currency_code: CurrencyCode;
  name: string;
  account_type: AccountType;
  opening_balance: string;
  opening_date: string;
}

export interface FundingSourceRecord extends Audited {
  id: string;
  name: string;
  funding_type: FundingType;
  currency_code: CurrencyCode;
  counterparty_id: string | null;
  available_amount: string;
  utilized_amount: string;
  maturity_date: string | null;
  is_synthetic: boolean;
}

export interface LiquidAssetRecord extends Audited {
  id: string;
  security_id: string;
  name: string;
  asset_class: AssetClass;
  currency_code: CurrencyCode;
  issuer_counterparty_id: string | null;
  market_value: string;
  haircut: string; // fraction
  is_encumbered: boolean;
  maturity_date: string;
  is_synthetic: boolean;
}

export interface ExposureRecord extends Audited {
  id: string;
  currency_code: CurrencyCode;
  exposure_type: ExposureType;
  position: Position;
  exposure_amount: string;
  value_date: string | null;
  counterparty_id: string | null;
  description: string;
  is_synthetic: boolean;
}

export interface FxRateRecord {
  id: number;
  currency_code: CurrencyCode;
  rate_date: string;
  rate_to_base: string;
  source: "SYNTHETIC" | "MANUAL";
  created_at: string;
  created_by: string | null;
}

export interface AuditRecord {
  id: number;
  at: string;
  actor: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "EXPORT" | "LOGIN" | "CANCEL" | "SETTLE" | "FAIL";
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes?: Record<string, [unknown, unknown]>;
}

export interface Db {
  schema: number;
  counterparties: CounterpartyRecord[];
  ratingHistory: RatingHistoryRecord[];
  deals: DealRecord[];
  cashFlows: CashFlowRecord[];
  cashAccounts: CashAccountRecord[];
  fundingSources: FundingSourceRecord[];
  liquidAssets: LiquidAssetRecord[];
  exposures: ExposureRecord[];
  fxRates: FxRateRecord[];
  audit: AuditRecord[];
  seq: number;
}

const KEY = "lrs.mock.db";

/** Timestamp used for seeded records that carry no audit fields of their own. */
export const SEEDED_AT = "2026-11-12T18:00:00.000Z";

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
    /* storage full or unavailable: changes last until reload */
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

type TableName = "counterparties" | "deals" | "cashFlows" | "cashAccounts" | "fundingSources" | "liquidAssets" | "exposures";

// Development hooks for automated UI checks (never shipped in production builds).
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __lrsMock: unknown }).__lrsMock = {
    reset: () => {
      resetDb();
      commit();
    },
    /** Simulate another user editing a record (optimistic-locking demo). */
    touch: (table: TableName, id: string) => {
      const rows = db()[table] as { id: string; version: number; updated_at?: string; updated_by?: string | null }[];
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.version += 1;
        r.updated_at = nowIso();
        r.updated_by = "Alex Admin";
        commit();
      }
    },
    touchCounterparty: (id: string) => (window as unknown as { __lrsMock: { touch: (t: TableName, i: string) => void } }).__lrsMock.touch("counterparties", id),
    size: () => JSON.stringify(db()).length,
  };
}
