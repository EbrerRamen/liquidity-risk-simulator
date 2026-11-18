/** FX rates API (TECHNICAL_PLAN §4.3): rate_to_base = base units per 1 unit of currency. */
import { fxRatesMock } from "@/mocks/fxRates";
import type { CurrencyCode } from "@/mocks/reference";

export interface FxLatest {
  currency_code: CurrencyCode;
  rate_to_base: string;
  rate_date: string;
  source: "SYNTHETIC" | "MANUAL";
  change_1d: string | null; // fraction
  change_30d: string | null; // fraction
  /** Last 30 business-day rates, oldest first, for a sparkline. */
  trend: string[];
}

export interface FxHistoryPoint {
  id: number;
  rate_date: string;
  rate_to_base: string;
  source: "SYNTHETIC" | "MANUAL";
  created_by: string | null;
  created_at: string;
}

export interface FxRateInput {
  currency_code: CurrencyCode;
  rate_date: string;
  rate_to_base: string;
  /** Replace an existing rate for the same currency and date. */
  replace?: boolean;
}

export const fxRatesApi = {
  latest: (asOf?: string): Promise<FxLatest[]> => fxRatesMock.latest(asOf),
  history: (ccy: string, from?: string, to?: string): Promise<FxHistoryPoint[]> => fxRatesMock.history(ccy, from, to),
  create: (input: FxRateInput): Promise<FxHistoryPoint> => fxRatesMock.create(input),
  remove: (id: number): Promise<void> => fxRatesMock.remove(id),
};
