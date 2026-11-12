/**
 * Chart geometry works in `number`; display formatting works on decimal strings.
 * This bridges a computed number back to a decimal string for <Money> and the
 * formatters. Display-only: exact values always come from the API's strings.
 */
export function toDecimal(n: number, dp = 4): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(dp);
}
