/** Small read helpers shared by mock endpoints. */
import { BASE_CCY } from "./dashboard-data";
import { businessDate, db } from "./db";
import { ratesAt } from "./positions";
import type { CurrencyCode } from "./reference";
import { isBusinessDay } from "./schedule";

export const cpName = (id: string | null | undefined): string | null => (id ? (db().counterparties.find((c) => c.id === id)?.name ?? null) : null);

/** Base-currency equivalent at S_c(T0). */
export function toBase(amount: string | number, ccy: CurrencyCode): number {
  return Number(amount) * ratesAt(businessDate())[ccy];
}

export const money = (n: number, ccy: string) => n.toFixed(ccy === "JPY" ? 0 : 2);

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
export const fmtDate = (iso: string) => DATE.format(new Date(iso + "T00:00:00Z"));

/** "13 Dec 2026 is a Sunday" style message for weekend dates, or null. */
export function weekendMessage(iso: string): string | null {
  if (isBusinessDay(iso)) return null;
  let next = iso;
  do next = new Date(Date.parse(next + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  while (!isBusinessDay(next));
  return `${fmtDate(iso)} is a ${WEEKDAY.format(new Date(iso + "T00:00:00Z"))}; the next business day is ${fmtDate(next)}`;
}

export { BASE_CCY, businessDate };
