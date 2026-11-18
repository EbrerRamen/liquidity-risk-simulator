/**
 * String decimal helpers for inputs. Values stay strings end to end
 * (TECHNICAL_PLAN C2), so typed amounts never pass through floating point.
 */

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function isDecimal(s: string): boolean {
  return DECIMAL_RE.test(s);
}

/** Move the decimal point: shiftDecimal("5.25", -2) = "0.0525"; shiftDecimal("0.0525", 2) = "5.25". */
export function shiftDecimal(value: string, places: number): string {
  const neg = value.startsWith("-");
  const [w = "0", f = ""] = value.replace(/^[+-]/, "").split(".");
  let digits = w + f;
  let point = w.length + places;
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point > digits.length) digits = digits + "0".repeat(point - digits.length);
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0";
  const frac = digits.slice(point).replace(/0+$/, "");
  const out = frac ? `${whole}.${frac}` : whole;
  return neg && out !== "0" ? `-${out}` : out;
}

const SUFFIX: Record<string, number> = { k: 3, m: 6, mm: 6, bn: 9, b: 9 };

/**
 * Parse what a treasury user types into an amount field: "25,000,000",
 * "25m", "1.5bn", "250k". Returns a plain decimal string, or null if invalid.
 */
export function parseAmountInput(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/[,\s_]/g, "");
  if (!s) return null;
  const m = s.match(/^(-?\d*\.?\d+)(k|mm|m|bn|b)?$/);
  if (!m) return null;
  const n = m[1]!.startsWith(".") ? `0${m[1]}` : m[1]!.replace(/^(-?)\./, "$10.");
  if (!isDecimal(n)) return null;
  return m[2] ? shiftDecimal(n, SUFFIX[m[2]]!) : shiftDecimal(n, 0);
}

/** Round a decimal string half-even to `dp` places (exact, via BigInt). */
export function roundDecimal(value: string, dp: number): string {
  const neg = value.startsWith("-");
  const [w = "0", f = ""] = value.replace(/^[+-]/, "").split(".");
  const scale = f.length;
  const digits = BigInt(w + f);
  let out: bigint;
  if (scale <= dp) out = digits * 10n ** BigInt(dp - scale);
  else {
    const div = 10n ** BigInt(scale - dp);
    out = digits / div;
    const r = digits % div;
    if (r * 2n > div || (r * 2n === div && out % 2n === 1n)) out += 1n;
  }
  const s = out.toString().padStart(dp + 1, "0");
  const res = dp > 0 ? `${s.slice(0, s.length - dp)}.${s.slice(s.length - dp)}` : s;
  return neg && out !== 0n ? `-${res}` : res;
}

/** "25000000.5" → "25,000,000.50" (dp places, grouped). Input must be a decimal string. */
export function groupDecimal(value: string, dp: number): string {
  const r = roundDecimal(value, dp);
  const neg = r.startsWith("-");
  const [w = "0", f] = r.replace("-", "").split(".");
  return (neg ? "-" : "") + w.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f !== undefined ? `.${f}` : "");
}

export function compareDecimal(a: string, b: string): number {
  return Math.sign(Number(a) - Number(b));
}
