/**
 * Business-day calendar (TECHNICAL_PLAN §5.2): Saturday and Sunday are
 * non-business days; no holiday calendars in v1. Dates are ISO strings in UTC.
 */
const toDate = (iso: string) => new Date(iso + "T00:00:00Z");
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function isBusinessDay(iso: string): boolean {
  const wd = toDate(iso).getUTCDay();
  return wd !== 0 && wd !== 6;
}

export function shiftDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

/** Next business day on or after `iso`. */
export function following(iso: string): string {
  let d = iso;
  while (!isBusinessDay(d)) d = shiftDays(d, 1);
  return d;
}

/** Modified Following: next business day, unless that crosses into the next month. */
export function modifiedFollowing(iso: string): string {
  const f = following(iso);
  if (f.slice(0, 7) === iso.slice(0, 7)) return f;
  let d = iso;
  while (!isBusinessDay(d)) d = shiftDays(d, -1);
  return d;
}

function lastDayOfMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** Add months with the end-of-month rule: a month-end start rolls to month-ends. */
export function addMonths(iso: string, n: number): string {
  const d = toDate(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const eom = day === lastDayOfMonth(y, m);
  const target = new Date(Date.UTC(y, m + n, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  const last = lastDayOfMonth(ty, tm);
  return toIso(new Date(Date.UTC(ty, tm, eom ? last : Math.min(day, last))));
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** "13 Dec 2026 is a Sunday; the next business day is 14 Dec 2026", or null for a business day. */
export function weekendMessage(iso: string): string | null {
  if (isBusinessDay(iso)) return null;
  const fmt = (d: string) => DATE.format(toDate(d));
  return `${fmt(iso)} is a ${WEEKDAY.format(toDate(iso))}; the next business day is ${fmt(following(iso))}`;
}
