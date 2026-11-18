/** Money-market deals API (TECHNICAL_PLAN §4.3, §5.3). */
import { dealsMock } from "@/mocks/deals";
import type { CurrencyCode, DayCountCode, DealStatus, DealType, InterestFrequency } from "@/mocks/reference";
import type { CashFlowItem } from "./cashFlows";
import type { Audited, ListQueryParams, Money, Page } from "./types";

export interface DealFilters extends ListQueryParams {
  q?: string;
  /** live = pending or settled (default); closed = matured, cancelled or failed. */
  scope?: "live" | "closed" | "all";
  counterparty_id?: string;
  currency_code?: string;
  deal_type?: string;
  direction?: string;
  settlement_status?: string;
  maturity_from?: string;
  maturity_to?: string;
  value_from?: string;
  value_to?: string;
}

export interface DealItem {
  id: string;
  deal_reference: string;
  counterparty_id: string;
  counterparty_name: string;
  currency_code: CurrencyCode;
  deal_type: DealType;
  direction: "LEND" | "BORROW";
  principal: Money;
  interest_rate: string; // annual fraction
  day_count: DayCountCode;
  deal_date: string;
  value_date: string;
  maturity_date: string;
  interest_frequency: InterestFrequency;
  settlement_status: DealStatus;
  /** True once any cash flow has settled: economics can no longer change (C10). */
  locked: boolean;
  version: number;
}

export interface Deal extends DealItem, Omit<Audited, "version"> {
  tenor_days: number;
  /** Net interest from our side: positive = received. */
  net_interest: Money;
  principal_base: Money;
  flows: { total: number; settled: number; projected: number };
  is_synthetic: boolean;
}

export interface DealInput {
  counterparty_id: string;
  currency_code: CurrencyCode;
  deal_type: DealType;
  direction: "LEND" | "BORROW";
  principal: Money;
  interest_rate: string;
  day_count: DayCountCode;
  deal_date: string;
  value_date: string;
  maturity_date: string;
  interest_frequency: InterestFrequency;
}

export interface ScheduleFlow {
  kind: "PRINCIPAL" | "INTEREST";
  direction: "IN" | "OUT";
  amount: Money;
  date: string;
  unadjusted_date: string | null;
  period: { start: string; end: string; days: number } | null;
}

/** POST /deals/preview-schedule: the schedule for a draft deal, nothing saved. */
export interface SchedulePreview {
  flows: ScheduleFlow[];
  tenor_days: number;
  net_interest: Money;
  periods: number;
  currency_code: CurrencyCode;
  day_count: DayCountCode;
}

export interface DealSummary {
  base_currency: string;
  live: number;
  borrowed: Money;
  lent: Money;
  maturing_30d: number;
  next_maturity: { deal_id: string; reference: string; date: string } | null;
}

export const dealsApi = {
  list: (f: DealFilters): Promise<Page<DealItem>> => dealsMock.list(f),
  get: (id: string): Promise<Deal> => dealsMock.get(id),
  summary: (f: DealFilters): Promise<DealSummary> => dealsMock.summary(f),
  cashFlows: (id: string): Promise<CashFlowItem[]> => dealsMock.cashFlows(id),
  previewSchedule: (input: DealInput): Promise<SchedulePreview> => dealsMock.previewSchedule(input),
  create: (input: DealInput): Promise<Deal> => dealsMock.create(input),
  update: (id: string, patch: Partial<DealInput> & { version: number }): Promise<Deal> => dealsMock.update(id, patch),
  cancel: (id: string, version: number): Promise<Deal> => dealsMock.cancel(id, version),
  remove: (id: string, version: number): Promise<void> => dealsMock.remove(id, version),
  exportCsv: (f: DealFilters) => dealsMock.exportCsv(f),
};
