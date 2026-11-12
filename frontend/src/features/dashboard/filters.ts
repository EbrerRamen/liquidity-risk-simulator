import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import type { CurrencyFilter, DashboardFilters, Horizon, Lookback } from "@/mocks/dashboard";
import { CURRENCIES } from "@/mocks/dashboard-data";

export const HORIZONS: ReadonlyArray<{ value: `${Horizon}`; label: string }> = [
  { value: "7", label: "7D" },
  { value: "14", label: "14D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
];

export const LOOKBACKS: ReadonlyArray<{ value: `${Lookback}`; label: string }> = [
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "180", label: "180D" },
];

const DEFAULTS: DashboardFilters = { horizon: 30, lookback: 90, currency: "ALL" };

function parse<T extends string | number>(raw: string | null, allowed: readonly T[], fallback: T): T {
  if (raw === null) return fallback;
  const match = allowed.find((a) => String(a) === raw);
  return match ?? fallback;
}

/** Dashboard filters live in the URL, so a view can be shared and reloaded as-is. */
export function useDashboardFilters(): [DashboardFilters, (patch: Partial<DashboardFilters>) => void] {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<DashboardFilters>(
    () => ({
      horizon: parse(params.get("horizon"), [7, 14, 30, 90] as const, DEFAULTS.horizon),
      lookback: parse(params.get("lookback"), [30, 90, 180] as const, DEFAULTS.lookback),
      currency: parse<CurrencyFilter>(params.get("ccy"), ["ALL", ...CURRENCIES], DEFAULTS.currency),
    }),
    [params],
  );

  const update = useCallback(
    (patch: Partial<DashboardFilters>) => {
      const next = { ...filters, ...patch };
      const p = new URLSearchParams();
      if (next.horizon !== DEFAULTS.horizon) p.set("horizon", String(next.horizon));
      if (next.lookback !== DEFAULTS.lookback) p.set("lookback", String(next.lookback));
      if (next.currency !== DEFAULTS.currency) p.set("ccy", next.currency);
      setParams(p, { replace: true });
    },
    [filters, setParams],
  );

  return [filters, update];
}
