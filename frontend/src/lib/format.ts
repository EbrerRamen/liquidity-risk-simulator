/**
 * Display formatting for money, ratios and dates.
 *
 * Money and rates arrive from the API as decimal strings (TECHNICAL_PLAN §4.1).
 * Exact formatting works on the string with BigInt, so no precision is lost.
 * Compact notation (1.25bn) goes through `number`; it is display-only, and the
 * exact value is always available in a tooltip.
 */

export const MINUS = "−"; // typographic minus, same width as plus in Inter

/** ISO 4217 minor units for the currencies the simulator uses. Default 2. */
const MINOR_UNITS: Record<string, number> = { JPY: 0, KRW: 0, BHD: 3, KWD: 3 };

export function minorUnits(currency: string): number {
  return MINOR_UNITS[currency] ?? 2;
}

interface ParsedDecimal {
  negative: boolean;
  digits: bigint; // absolute value scaled by 10^scale
  scale: number;
}

function parseDecimal(value: string): ParsedDecimal {
  const trimmed = value.trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a decimal string: "${value}"`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [whole = "0", frac = ""] = unsigned.split(".");
  return { negative, digits: BigInt(whole + frac), scale: frac.length };
}

/** Round half-even to `dp` decimal places, matching the backend's ROUND_HALF_EVEN. */
function roundHalfEven(d: ParsedDecimal, dp: number): ParsedDecimal {
  if (d.scale <= dp) {
    return { ...d, digits: d.digits * 10n ** BigInt(dp - d.scale), scale: dp };
  }
  const divisor = 10n ** BigInt(d.scale - dp);
  let q = d.digits / divisor;
  const r = d.digits % divisor;
  const twice = r * 2n;
  if (twice > divisor || (twice === divisor && q % 2n === 1n)) q += 1n;
  return { negative: d.negative, digits: q, scale: dp };
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function isNegative(value: string): boolean {
  const d = parseDecimal(value);
  return d.negative && d.digits !== 0n;
}

export interface NumberFormatOptions {
  /** Decimal places. Defaults to the currency's minor units, or 2. */
  dp?: number;
  /** "negative" shows only a minus; "always" also shows + for positives. */
  sign?: "negative" | "always";
}

/** Exact, grouped formatting of a decimal string: "-1250000.5" → "−1,250,000.50". */
export function formatDecimal(value: string, opts: NumberFormatOptions = {}): string {
  const dp = opts.dp ?? 2;
  const rounded = roundHalfEven(parseDecimal(value), dp);
  const s = rounded.digits.toString().padStart(dp + 1, "0");
  const whole = s.slice(0, s.length - dp);
  const frac = dp > 0 ? "." + s.slice(s.length - dp) : "";
  const isZero = rounded.digits === 0n;
  const prefix = rounded.negative && !isZero ? MINUS : opts.sign === "always" && !isZero ? "+" : "";
  return prefix + groupThousands(whole) + frac;
}

/** Exact money: "−1,250,000.00". The currency code is rendered separately by <Money>. */
export function formatMoney(value: string, currency: string, opts: Omit<NumberFormatOptions, "dp"> = {}): string {
  return formatDecimal(value, { ...opts, dp: minorUnits(currency) });
}

const COMPACT_STEPS: [number, string][] = [
  [1e12, "tn"],
  [1e9, "bn"],
  [1e6, "m"],
  [1e3, "k"],
];

/** Compact notation for KPIs: 1250000000 → "1.25bn". Display-only precision. */
export function formatCompact(value: string, opts: { sign?: "negative" | "always"; digits?: number } = {}): string {
  const n = Number(value);
  const abs = Math.abs(n);
  const digits = opts.digits ?? 3; // significant digits
  const prefix = n < 0 && abs > 0 ? MINUS : opts.sign === "always" && abs > 0 ? "+" : "";
  for (const [step, suffix] of COMPACT_STEPS) {
    if (abs >= step) {
      const scaled = abs / step;
      const dp = Math.max(0, digits - Math.floor(Math.log10(scaled)) - 1);
      return prefix + trimZeros(scaled.toFixed(dp)) + suffix;
    }
  }
  return prefix + trimZeros(abs.toFixed(abs >= 100 ? 0 : 2));
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Ratio stored as a fraction → percent: "0.0525" → "5.25%". */
export function formatPercent(ratio: string, opts: { dp?: number; sign?: "negative" | "always" } = {}): string {
  const d = parseDecimal(ratio);
  const asPercent = formatDecimal(
    (d.negative ? "-" : "") + shiftDecimal(d.digits, d.scale - 2),
    { dp: opts.dp ?? 2, sign: opts.sign },
  );
  return asPercent + "%";
}

function shiftDecimal(digits: bigint, scale: number): string {
  if (scale <= 0) return (digits * 10n ** BigInt(-scale)).toString();
  const s = digits.toString().padStart(scale + 1, "0");
  return s.slice(0, s.length - scale) + "." + s.slice(s.length - scale);
}

/** Coverage-style multiple: "1.4237" → "1.42×". */
export function formatMultiple(value: string, dp = 2): string {
  return formatDecimal(value, { dp }) + "×";
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_SHORT_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

/** ISO date (YYYY-MM-DD) → "12 Nov 2026". Dates are calendar dates, so format in UTC. */
export function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso + "T00:00:00Z"));
}

export function formatDateShort(iso: string): string {
  return DATE_SHORT_FMT.format(new Date(iso + "T00:00:00Z"));
}

export function formatWeekday(iso: string): string {
  return WEEKDAY_FMT.format(new Date(iso + "T00:00:00Z"));
}
