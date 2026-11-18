/** Mock of /cash-accounts. One account per currency; Cash(T0) = opening balance + settled flows since (§5.5). */
import type { CashAccount, CashAccountFilters, CashAccountInput, CashAccountItem } from "@/api/cashAccounts";
import type { Ccy } from "./dashboard-data";
import { crud, csvIn, decimalPlaces, isDec, isIsoDate, type FieldError } from "./crud";
import { db, type CashAccountRecord } from "./db";
import { BUSINESS_DATE, fmtDate, money, toBase } from "./lookup";
import { cashBalance } from "./positions";
import { ACCOUNT_TYPES, CURRENCY_LIST } from "./reference";

function settledSince(r: CashAccountRecord) {
  return db().cashFlows.filter((f) => f.currency_code === r.currency_code && f.status === "SETTLED" && f.actual_date! > r.opening_date && f.actual_date! <= BUSINESS_DATE).length;
}

function toItem(r: CashAccountRecord): CashAccountItem {
  const current = cashBalance(r.currency_code as Ccy);
  return {
    id: r.id,
    currency_code: r.currency_code,
    name: r.name,
    account_type: r.account_type,
    opening_balance: r.opening_balance,
    opening_date: r.opening_date,
    current_balance: money(current, r.currency_code),
    movement: money(current - Number(r.opening_balance), r.currency_code),
    current_balance_base: money(toBase(current, r.currency_code), "USD"),
    settled_flows: settledSince(r),
    version: r.version,
  };
}

export const cashAccountsMock = crud<CashAccountRecord, CashAccountFilters, CashAccountItem, CashAccount, CashAccountInput>({
  base: "/api/v1/cash-accounts",
  entity: "cash account",
  idPrefix: "ca",
  table: () => db().cashAccounts,
  setTable: (rows) => (db().cashAccounts = rows),
  label: (r) => r.name,
  filter: (rows, f) => {
    const q = f.q?.trim().toLowerCase();
    const ccys = csvIn(f.currency_code);
    return rows.filter((r) => (!q || r.name.toLowerCase().includes(q) || r.currency_code.toLowerCase() === q) && (!ccys.length || ccys.includes(r.currency_code)));
  },
  sorters: {
    currency_code: (r) => CURRENCY_LIST.indexOf(r.currency_code),
    name: (r) => r.name,
    account_type: (r) => r.account_type,
    opening_date: (r) => r.opening_date,
    current_balance: (r) => toBase(cashBalance(r.currency_code as Ccy), r.currency_code),
  },
  defaultSort: [{ field: "currency_code", dir: "asc" }],
  toItem,
  toEntity: (r) => ({ ...toItem(r), created_at: r.created_at, updated_at: r.updated_at, created_by: r.created_by, updated_by: r.updated_by }),
  // The currency is the account's identity (one per currency).
  editable: ["name", "account_type", "opening_balance", "opening_date"],
  normalize: (i) => (typeof i.name === "string" ? { ...i, name: i.name.trim() } : i),
  validate: (i, existing) => {
    const e: FieldError[] = [];
    if (!existing && !CURRENCY_LIST.includes(i.currency_code)) e.push({ field: "currency_code", message: "choose a currency" });
    if (!i.name || i.name.length < 2) e.push({ field: "name", message: "must be at least 2 characters" });
    if (!ACCOUNT_TYPES.includes(i.account_type)) e.push({ field: "account_type", message: "choose an account type" });
    const ccy = existing?.currency_code ?? i.currency_code;
    const dp = ccy === "JPY" ? 0 : 2;
    if (!isDec(i.opening_balance)) e.push({ field: "opening_balance", message: "enter the balance (negative for an overdraft)" });
    else if (decimalPlaces(i.opening_balance) > dp) e.push({ field: "opening_balance", message: `use at most ${dp} decimal places for ${ccy}` });
    if (!isIsoDate(i.opening_date) || i.opening_date > BUSINESS_DATE) e.push({ field: "opening_date", message: `must be on or before the business date (${fmtDate(BUSINESS_DATE)})` });
    return e;
  },
  duplicates: (i, existing) =>
    !existing && db().cashAccounts.some((r) => r.currency_code === i.currency_code) ? [{ field: "currency_code", message: `${i.currency_code} already has a cash account` }] : [],
  build: (i, { id, user, now }) => ({ id, ...i, version: 1, created_at: now, updated_at: now, created_by: user.name, updated_by: user.name }),
  inUse: (r) => {
    const n = settledSince(r);
    return n > 0
      ? `${n} settled ${r.currency_code} cash flows are anchored to this account's opening balance. Deleting it would drop ${r.currency_code} cash from opening liquidity; correct the opening balance instead.`
      : null;
  },
  csv: {
    name: "cash_accounts",
    header: ["id", "currency_code", "name", "account_type", "opening_balance", "opening_date", "current_balance"],
    row: (r) => [r.id, r.currency_code, r.name, r.account_type, r.opening_balance, r.opening_date, money(cashBalance(r.currency_code as Ccy), r.currency_code)],
  },
});
