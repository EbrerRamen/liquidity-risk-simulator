/**
 * Deal cash-flow schedule engine (TECHNICAL_PLAN §5.3), mocked in the browser
 * until the backend's `engines/schedule.py` exists. Pure: no clock, no store.
 *
 *  - LEND: OUT principal on the value date, IN interest on each payment date,
 *    IN principal at maturity. BORROW is the mirror image.
 *  - Interest for period k: I = P × r × d / B, d = actual days in [start, end),
 *    B = 360 (ACT/360) or 365 (ACT/365F). Quantised once, half-even, to minor units.
 *  - Periodic dates roll from the value date by 1/3/6 months (end-of-month rule),
 *    adjusted by Modified Following. The final period ends at maturity.
 *  - A negative interest amount reverses the flow's direction.
 *
 * Arithmetic is exact: amounts are BigInt minor units, rates are scaled integers.
 */

export type DayCount = "ACT_360" | "ACT_365F";
export type Frequency = "AT_MATURITY" | "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL";
export type Direction = "LEND" | "BORROW";

export const DEFAULT_DAY_COUNT: Record<string, DayCount> = {
  USD: "ACT_360",
  EUR: "ACT_360",
  CHF: "ACT_360",
  GBP: "ACT_365F",
  JPY: "ACT_365F",
  AUD: "ACT_365F",
  SGD: "ACT_365F",
};

const MONTHS: Record<Frequency, number> = { AT_MATURITY: 0, MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6 };
export const minorUnits = (ccy: string) => (ccy === "JPY" ? 0 : 2);

/* ---------- calendar (weekends only; no holiday calendars in v1, §5.2) ---------- */

import { addMonths, daysBetween, following, isBusinessDay, modifiedFollowing, shiftDays } from "@/lib/calendar";

export { addMonths, daysBetween, following, isBusinessDay, modifiedFollowing, shiftDays };

/* ---------- exact decimal helpers ---------- */

const RATE_SCALE = 10n ** 10n;

/** Rates are annual fractions as on the API ("0.0525" = 5.25%), scaled to 10 decimal places. */
function rateToScaled(rate: string): bigint {
  const neg = rate.trim().startsWith("-");
  const [w = "0", f = ""] = rate.replace(/^[+-]/, "").split(".");
  const v = BigInt(w + (f + "0000000000").slice(0, 10));
  return neg ? -v : v;
}

function amountToMinor(amount: string, ccy: string): bigint {
  const dp = minorUnits(ccy);
  const [w = "0", f = ""] = amount.replace(/,/g, "").split(".");
  return BigInt(w + (f + "000").slice(0, dp));
}

export function minorToAmount(minor: bigint, ccy: string): string {
  const dp = minorUnits(ccy);
  const neg = minor < 0n;
  const s = (neg ? -minor : minor).toString().padStart(dp + 1, "0");
  const out = dp === 0 ? s : `${s.slice(0, s.length - dp)}.${s.slice(s.length - dp)}`;
  return (neg ? "-" : "") + out;
}

/** num / den rounded half-even (den > 0). */
function divHalfEven(num: bigint, den: bigint): bigint {
  const neg = num < 0n;
  const a = neg ? -num : num;
  let q = a / den;
  const r = a % den;
  if (r * 2n > den || (r * 2n === den && q % 2n === 1n)) q += 1n;
  return neg ? -q : q;
}

/* ---------- schedule ---------- */

export interface ScheduleInput {
  direction: Direction;
  currency: string;
  principal: string; // decimal string, > 0
  interest_rate: string; // annual fraction, e.g. "0.0525"
  day_count: DayCount;
  value_date: string;
  maturity_date: string;
  interest_frequency: Frequency;
}

export interface ScheduleFlow {
  kind: "PRINCIPAL" | "INTEREST";
  direction: "IN" | "OUT";
  amount: string; // positive decimal string
  date: string; // adjusted payment date
  unadjusted_date: string | null; // set when Modified Following moved the date
  period: { start: string; end: string; days: number } | null;
}

export interface Schedule {
  flows: ScheduleFlow[];
  tenor_days: number;
  /** Net interest from the deal holder's view: positive = received. */
  net_interest: string;
  periods: number;
}

export function buildSchedule(input: ScheduleInput): Schedule {
  const { direction, currency, value_date, maturity_date, interest_frequency, day_count } = input;
  const P = amountToMinor(input.principal, currency);
  const r = rateToScaled(input.interest_rate);
  const basis = day_count === "ACT_360" ? 360n : 365n;
  const lend = direction === "LEND";

  // Payment dates: roll from the value date, adjust, stop before maturity.
  const step = MONTHS[interest_frequency];
  const ends: { date: string; unadjusted: string | null }[] = [];
  if (step > 0) {
    for (let k = 1; ; k++) {
      const raw = addMonths(value_date, k * step);
      if (raw >= maturity_date) break;
      const adj = modifiedFollowing(raw);
      if (adj >= maturity_date) break;
      ends.push({ date: adj, unadjusted: adj !== raw ? raw : null });
    }
  }
  ends.push({ date: maturity_date, unadjusted: null });

  const flows: ScheduleFlow[] = [
    { kind: "PRINCIPAL", direction: lend ? "OUT" : "IN", amount: minorToAmount(P, currency), date: value_date, unadjusted_date: null, period: null },
  ];

  let start = value_date;
  let net = 0n;
  for (const e of ends) {
    const days = BigInt(daysBetween(start, e.date));
    const interest = divHalfEven(P * r * days, basis * RATE_SCALE); // signed, minor units
    if (interest !== 0n) {
      // Positive interest: the lender receives it. A negative rate reverses that.
      const receive = lend ? interest > 0n : interest < 0n;
      flows.push({
        kind: "INTEREST",
        direction: receive ? "IN" : "OUT",
        amount: minorToAmount(interest < 0n ? -interest : interest, currency),
        date: e.date,
        unadjusted_date: e.unadjusted,
        period: { start, end: e.date, days: Number(days) },
      });
      net += receive ? (interest < 0n ? -interest : interest) : -(interest < 0n ? -interest : interest);
    }
    start = e.date;
  }
  flows.push({ kind: "PRINCIPAL", direction: lend ? "IN" : "OUT", amount: minorToAmount(P, currency), date: maturity_date, unadjusted_date: null, period: null });

  return { flows, tenor_days: daysBetween(value_date, maturity_date), net_interest: minorToAmount(net, currency), periods: ends.length };
}
