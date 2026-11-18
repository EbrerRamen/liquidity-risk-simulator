/** Funding sources API (TECHNICAL_PLAN §4.3). Swap the mock for the typed client when the backend exists. */
import { fundingMock } from "@/mocks/funding";
import type { CurrencyCode, FundingType } from "@/mocks/reference";
import type { Audited, ListQueryParams, Money, Page } from "./types";

export interface FundingFilters extends ListQueryParams {
  q?: string;
  funding_type?: string;
  currency_code?: string;
  counterparty_id?: string;
}

export interface FundingListItem {
  id: string;
  name: string;
  funding_type: FundingType;
  currency_code: CurrencyCode;
  counterparty_id: string | null;
  counterparty_name: string | null;
  available_amount: Money;
  utilized_amount: Money;
  /** Limit minus drawn for lines and facilities; null for deposit pools. */
  headroom: Money | null;
  utilization: string | null;
  maturity_date: string | null;
  /** How it counts in liquidity (§5.5): deposits are funding; committed headroom only if facilities are included; the rest are memo items. */
  liquidity_treatment: "FUNDING" | "HEADROOM_IF_INCLUDED" | "MEMO";
  version: number;
}

export interface FundingSource extends FundingListItem, Omit<Audited, "version"> {
  is_synthetic: boolean;
}

export interface FundingInput {
  name: string;
  funding_type: FundingType;
  currency_code: CurrencyCode;
  counterparty_id: string | null;
  available_amount: Money;
  utilized_amount: Money;
  maturity_date: string | null;
}

export interface FundingSummary {
  base_currency: string;
  total_funding: Money;
  deposits: Money;
  drawn_lines: Money;
  deposit_share: string;
  committed_headroom: Money;
  memo_capacity: Money;
  sources: number;
}

export const fundingApi = {
  list: (f: FundingFilters): Promise<Page<FundingListItem>> => fundingMock.list(f),
  get: (id: string): Promise<FundingSource> => fundingMock.get(id),
  summary: (f: FundingFilters): Promise<FundingSummary> => fundingMock.summary(f),
  create: (input: FundingInput): Promise<FundingSource> => fundingMock.create(input),
  update: (id: string, patch: Partial<FundingInput> & { version: number }): Promise<FundingSource> => fundingMock.update(id, patch),
  remove: (id: string, version: number): Promise<void> => fundingMock.remove(id, version),
  exportCsv: (f: FundingFilters) => fundingMock.exportCsv(f),
};
