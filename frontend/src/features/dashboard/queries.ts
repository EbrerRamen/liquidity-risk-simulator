/**
 * Dashboard queries. Each wraps one /dashboard/* endpoint (mocked for now).
 * keepPreviousData holds the last render while new filters load, so charts dim
 * instead of flashing skeletons.
 */
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { isApiError } from "@/api/problem";
import {
  getCashHistory,
  getConcentration,
  getCurrencyDistribution,
  getFindings,
  getFlows,
  getKpis,
  getMaturitySchedule,
  getProjection,
  getRiskDistribution,
  getUpcomingMaturities,
  type DashboardFilters,
} from "@/mocks/dashboard";

const opts = { placeholderData: keepPreviousData } as const;

export const useKpis = (f: DashboardFilters) => useQuery({ queryKey: ["dashboard", "kpis", f], queryFn: () => getKpis(f), ...opts });
export const useProjection = (f: DashboardFilters) =>
  useQuery({ queryKey: ["dashboard", "projection", f.horizon, f.currency], queryFn: () => getProjection(f), ...opts });
export const useCashHistory = (f: DashboardFilters) =>
  useQuery({ queryKey: ["dashboard", "cash-history", f.lookback, f.currency], queryFn: () => getCashHistory(f), ...opts });
export const useFlows = (f: DashboardFilters) => useQuery({ queryKey: ["dashboard", "flows", f], queryFn: () => getFlows(f), ...opts });
export const useMaturitySchedule = (f: DashboardFilters) =>
  useQuery({ queryKey: ["dashboard", "maturity-schedule", f.horizon, f.currency], queryFn: () => getMaturitySchedule(f), ...opts });
export const useCurrencyDistribution = () =>
  useQuery({ queryKey: ["dashboard", "currency-distribution"], queryFn: getCurrencyDistribution, ...opts });
export const useConcentration = (basis: "funding" | "credit") =>
  useQuery({ queryKey: ["dashboard", "concentration", basis], queryFn: () => getConcentration(basis), ...opts });
export const useRiskDistribution = () => useQuery({ queryKey: ["dashboard", "risk-distribution"], queryFn: getRiskDistribution, ...opts });
export const useUpcomingMaturities = (f: DashboardFilters) =>
  useQuery({ queryKey: ["dashboard", "upcoming", f.horizon, f.currency], queryFn: () => getUpcomingMaturities(f), ...opts });
export const useFindings = (f: DashboardFilters) =>
  useQuery({ queryKey: ["dashboard", "findings", f.horizon, f.currency], queryFn: () => getFindings(f), ...opts });

/** Props for <ChartCard> from a query: status, dimmed refresh, error and retry. */
export function cardState(q: UseQueryResult<unknown>) {
  return {
    status: q.status,
    refreshing: q.isPlaceholderData,
    error: q.error ? { message: q.error.message, requestId: isApiError(q.error) ? q.error.requestId : undefined } : undefined,
    onRetry: () => void q.refetch(),
  };
}
