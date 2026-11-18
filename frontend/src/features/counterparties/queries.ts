import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { counterpartiesApi, type CounterpartyFilters, type CounterpartyInput, type CounterpartyPatch } from "@/api/counterparties";

export const cpKeys = {
  all: ["counterparties"] as const,
  list: (f: CounterpartyFilters) => ["counterparties", "list", f] as const,
  detail: (id: string) => ["counterparties", "detail", id] as const,
  summary: (id: string) => ["counterparties", "summary", id] as const,
  ratings: (id: string) => ["counterparties", "ratings", id] as const,
};

export const useCounterpartyList = (f: CounterpartyFilters) =>
  useQuery({ queryKey: cpKeys.list(f), queryFn: () => counterpartiesApi.list(f), placeholderData: keepPreviousData });

export const useCounterparty = (id: string | null) =>
  useQuery({ queryKey: cpKeys.detail(id ?? ""), queryFn: () => counterpartiesApi.get(id!), enabled: !!id, staleTime: 0 });

export const useCounterpartySummary = (id: string | null) =>
  useQuery({ queryKey: cpKeys.summary(id ?? ""), queryFn: () => counterpartiesApi.summary(id!), enabled: !!id });

export const useRatingHistory = (id: string | null) =>
  useQuery({ queryKey: cpKeys.ratings(id ?? ""), queryFn: () => counterpartiesApi.ratingHistory(id!), enabled: !!id });

/** After any write: refresh counterparty data and the dashboard figures derived from it. */
function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: cpKeys.all });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useCreateCounterparty() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: CounterpartyInput) => counterpartiesApi.create(input), onSuccess: invalidate });
}

export function useUpdateCounterparty() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CounterpartyPatch }) => counterpartiesApi.update(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteCounterparty() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => counterpartiesApi.remove(id, version),
    onSuccess: invalidate,
  });
}

export function useExportCounterparties() {
  return useMutation({ mutationFn: (f: CounterpartyFilters) => counterpartiesApi.exportCsv(f) });
}
