/**
 * Chart theme. Colours are CSS custom properties from tokens.css, so charts and
 * UI share one source. Mark specs follow the dataviz rules: 2px lines, bars
 * capped at 24px with 4px rounded data-ends, hairline solid grid, 2px gaps.
 */
export const C = {
  accent: "var(--color-accent)",
  in: "var(--color-series-in)",
  out: "var(--color-series-out)",
  net: "var(--color-series-net)",
  grid: "var(--color-grid)",
  axis: "var(--color-axis)",
  tick: "var(--color-fg-faint)",
  surface: "var(--color-surface-1)",
  warning: "var(--color-warning)",
  negative: "var(--color-negative)",
  muted: "var(--color-fg-muted)",
  faint: "var(--color-fg-faint)",
} as const;

export const CCY_COLOR: Record<string, string> = {
  USD: "var(--color-ccy-usd)",
  EUR: "var(--color-ccy-eur)",
  GBP: "var(--color-ccy-gbp)",
  JPY: "var(--color-ccy-jpy)",
  CHF: "var(--color-ccy-chf)",
  AUD: "var(--color-ccy-aud)",
  SGD: "var(--color-ccy-sgd)",
};

export const MARK = {
  line: 2,
  barMax: 24,
  barGap: 2,
  dot: 4, // radius, i.e. an 8px marker
} as const;

export const AXIS_TICK = { fill: C.tick, fontSize: 11 } as const;

/** Compact axis ticks without currency (the card subtitle names it): 0 / 500m / 1.5bn. */
export function tickMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1e9) return sign + trim(abs / 1e9) + "bn";
  if (abs >= 1e6) return sign + trim(abs / 1e6) + "m";
  if (abs >= 1e3) return sign + trim(abs / 1e3) + "k";
  return sign + String(abs);
}

function trim(n: number): string {
  return n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
}

const D = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
export const tickDate = (iso: string) => D.format(new Date(iso + "T00:00:00Z"));

/**
 * Round axis scale: ticks on 1 / 2 / 2.5 / 5 x 10^n steps, so axes read
 * 0 / 500m / 1bn / 1.5bn rather than 0 / 550m / 1.1bn.
 */
export function niceScale(min: number, max: number, count = 5): { domain: [number, number]; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const v = Number.isFinite(max) ? max : 0;
    return { domain: [Math.min(0, v), Math.max(1, v)], ticks: [Math.min(0, v), Math.max(1, v)] };
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { domain: [lo, hi], ticks };
}
