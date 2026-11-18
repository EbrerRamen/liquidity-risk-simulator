/** Cash accounts API (TECHNICAL_PLAN §4.3): the opening-balance anchor of Cash(T0) per currency. */
import { cashAccountsMock } from "@/mocks/cashAccounts";
import type { AccountType, CurrencyCode } from "@/mocks/reference";
import type { Audited, ListQueryParams, Money, Page } from "./types";

export interface CashAccountFilters extends ListQueryParams {
  q?: string;
  currency_code?: string;
}

export interface CashAccountItem {
  id: string;
  currency_code: CurrencyCode;
  name: string;
  account_type: AccountType;
  opening_balance: Money;
  opening_date: string;
  /** Cash(T0): opening balance plus settled flows after the opening date (§5.5). */
  current_balance: Money;
  movement: Money;
  current_balance_base: Money;
  settled_flows: number;
  version: number;
}

export type CashAccount = CashAccountItem & Omit<Audited, "version">;

export interface CashAccountInput {
  currency_code: CurrencyCode;
  name: string;
  account_type: AccountType;
  opening_balance: Money;
  opening_date: string;
}

export const cashAccountsApi = {
  list: (f: CashAccountFilters): Promise<Page<CashAccountItem>> => cashAccountsMock.list(f),
  get: (id: string): Promise<CashAccount> => cashAccountsMock.get(id),
  create: (input: CashAccountInput): Promise<CashAccount> => cashAccountsMock.create(input),
  update: (id: string, patch: Partial<CashAccountInput> & { version: number }): Promise<CashAccount> => cashAccountsMock.update(id, patch),
  remove: (id: string, version: number): Promise<void> => cashAccountsMock.remove(id, version),
  exportCsv: (f: CashAccountFilters) => cashAccountsMock.exportCsv(f),
};
