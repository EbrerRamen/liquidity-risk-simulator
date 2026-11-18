/** Cash flows API (TECHNICAL_PLAN §4.3, §5.4). */
import { cashFlowsMock } from "@/mocks/cashFlows";
import type { CashFlowCategory, CashFlowSource, CashFlowStatus, CurrencyCode } from "@/mocks/reference";
import type { Audited, ListQueryParams, Money, Page } from "./types";

export type CashFlowView = "upcoming" | "overdue" | "settled" | "all";

export interface CashFlowFilters extends ListQueryParams {
  q?: string;
  view?: CashFlowView;
  direction?: string;
  status?: string;
  category?: string;
  source?: string;
  currency_code?: string;
  counterparty_id?: string;
  deal_id?: string;
  expected_from?: string;
  expected_to?: string;
}

export interface CashFlowItem {
  id: string;
  transaction_reference: string;
  deal_id: string | null;
  deal_reference: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  currency_code: CurrencyCode;
  direction: "IN" | "OUT";
  category: CashFlowCategory;
  source: CashFlowSource;
  amount: Money;
  expected_date: string;
  settled_amount: Money | null;
  actual_date: string | null;
  status: CashFlowStatus;
  /** Projected but past its expected date (derived, never stored, §5.4). */
  overdue: boolean;
  version: number;
}

export interface CashFlow extends CashFlowItem, Omit<Audited, "version"> {
  note: string | null;
  amount_base: Money;
  is_synthetic: boolean;
  /** What the caller's role could do to this flow, given its state. */
  actions: { settle: boolean; fail: boolean; edit: boolean; cancel: boolean; delete: boolean };
}

export interface CashFlowInput {
  direction: "IN" | "OUT";
  category: CashFlowCategory;
  currency_code: CurrencyCode;
  amount: Money;
  expected_date: string;
  counterparty_id: string | null;
}

export interface SettleInput {
  version: number;
  actual_date: string;
  settled_amount: Money;
  note?: string;
}

export interface FailInput {
  version: number;
  note: string;
}

export interface CashFlowSummary {
  base_currency: string;
  as_of: string;
  settled_since: string;
  upcoming: { count: number; inflows: Money; outflows: Money };
  overdue: { count: number; inflows: Money; outflows: Money };
  settled: { count: number; inflows: Money; outflows: Money };
}

export const cashFlowsApi = {
  list: (f: CashFlowFilters): Promise<Page<CashFlowItem>> => cashFlowsMock.list(f),
  get: (id: string): Promise<CashFlow> => cashFlowsMock.get(id),
  summary: (f: CashFlowFilters): Promise<CashFlowSummary> => cashFlowsMock.summary(f),
  create: (input: CashFlowInput): Promise<CashFlow> => cashFlowsMock.create(input),
  update: (id: string, patch: Partial<CashFlowInput> & { version: number }): Promise<CashFlow> => cashFlowsMock.update(id, patch),
  settle: (id: string, input: SettleInput): Promise<CashFlow> => cashFlowsMock.settle(id, input),
  fail: (id: string, input: FailInput): Promise<CashFlow> => cashFlowsMock.fail(id, input),
  cancel: (id: string, version: number): Promise<CashFlow> => cashFlowsMock.cancel(id, version),
  remove: (id: string, version: number): Promise<void> => cashFlowsMock.remove(id, version),
  exportCsv: (f: CashFlowFilters) => cashFlowsMock.exportCsv(f),
};
