/**
 * Counterparties API (TECHNICAL_PLAN §4.3). Screens import from here, never
 * from the mocks: when the backend exists, only the function bodies change
 * (to the typed openapi-fetch client), and these types become generated ones.
 */
import * as mock from "@/mocks/counterparties";
import type { Band, CounterpartyType, Rating } from "@/mocks/reference";
import type { Audited, ListQueryParams, Money, Page } from "./types";

export type { Band, CounterpartyType, Rating };

export interface CounterpartyFilters extends ListQueryParams {
  q?: string;
  id?: string;
  counterparty_type?: string; // comma-separated
  country_code?: string; // comma-separated
  risk_classification?: string; // comma-separated
  model_band?: string; // comma-separated
  status?: "active" | "inactive" | "all";
  disagreement?: boolean;
}

export interface Assessment {
  band: Band;
  score: number; // 0-100
  as_of: string;
}

export interface CounterpartyListItem {
  id: string;
  name: string;
  counterparty_type: CounterpartyType;
  country_code: string;
  credit_rating: Rating;
  risk_classification: Band;
  is_active: boolean;
  latest_assessment: Assessment | null;
  exposure: { funding: Money; credit: Money; currency: string };
  open_deals: number;
  updated_at: string;
  version: number;
}

export interface Counterparty extends Audited {
  id: string;
  name: string;
  counterparty_type: CounterpartyType;
  country_code: string;
  credit_rating: Rating;
  risk_classification: Band;
  is_active: boolean;
  is_synthetic: boolean;
}

export interface CounterpartySummary {
  counterparty_id: string;
  as_of: string;
  exposure: { funding: Money; credit: Money; currency: string };
  open_deals: number;
  cash_flows: number;
  payment_behaviour: {
    window_days: number;
    settled: number;
    on_time_rate: string; // fraction
    avg_delay_days: string;
    failed: number;
  };
  latest_assessment: Assessment | null;
}

export interface RatingHistoryItem {
  credit_rating: Rating;
  effective_date: string;
}

export interface CounterpartyInput {
  name: string;
  counterparty_type: CounterpartyType;
  country_code: string;
  credit_rating: Rating;
  risk_classification: Band;
  is_active: boolean;
}

/** PATCH body: changed fields plus the version the client last saw (optimistic locking). */
export type CounterpartyPatch = Partial<CounterpartyInput> & { version: number };

export const counterpartiesApi = {
  list: (f: CounterpartyFilters): Promise<Page<CounterpartyListItem>> => mock.listCounterparties(f),
  get: (id: string): Promise<Counterparty> => mock.getCounterparty(id),
  summary: (id: string): Promise<CounterpartySummary> => mock.getCounterpartySummary(id),
  ratingHistory: (id: string): Promise<RatingHistoryItem[]> => mock.getRatingHistory(id),
  create: (input: CounterpartyInput): Promise<Counterparty> => mock.createCounterparty(input),
  update: (id: string, patch: CounterpartyPatch): Promise<Counterparty> => mock.updateCounterparty(id, patch),
  remove: (id: string, version: number): Promise<void> => mock.deleteCounterparty(id, version),
  exportCsv: (f: CounterpartyFilters) => mock.exportCounterpartiesCsv(f),
};
