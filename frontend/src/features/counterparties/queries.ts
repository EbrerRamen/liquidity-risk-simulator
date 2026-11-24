import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { counterpartiesApi, type Counterparty, type CounterpartyInput, type CounterpartyPatch } from "@/api/counterparties";

export const cpKeys = {
  all: ["counterparties"] as const,
  detail: (id: string) => ["counterparties", "detail", id] as const,
  summary: (id: string) => ["counterparties", "summary", id] as const,
  ratings: (id: string) => ["counterparties", "ratings", id] as const,
};

export const useCounterparty = (id: string | null) =>
  useQuery({ queryKey: cpKeys.detail(id ?? ""), queryFn: () => counterpartiesApi.get(id!), enabled: !!id, staleTime: 0 });

export const useCounterpartySummary = (id: string | null) =>
  useQuery({ queryKey: cpKeys.summary(id ?? ""), queryFn: () => counterpartiesApi.summary(id!), enabled: !!id });

export const useRatingHistory = (id: string | null) =>
  useQuery({ queryKey: cpKeys.ratings(id ?? ""), queryFn: () => counterpartiesApi.ratingHistory(id!), enabled: !!id });

/**
 * After any write, refresh every cached view: counterparty names and bands also
 * appear on deals, cash flows, pickers and the dashboard (same rule as useWrite).
 */
function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries();
}

/**
 * Store the record the server returned before refreshing everything else.
 * Otherwise an editor opened straight after a save starts from the stale,
 * pre-save copy, then remounts (losing typing) or saves with an old version
 * and conflicts with the user's own previous save.
 */
function useStoreSaved() {
  const qc = useQueryClient();
  return (saved: Counterparty) => qc.setQueryData(cpKeys.detail(saved.id), saved);
}

export function useCreateCounterparty() {
  const invalidate = useInvalidate();
  const store = useStoreSaved();
  return useMutation({
    mutationFn: (input: CounterpartyInput) => counterpartiesApi.create(input),
    onSuccess: (saved) => {
      store(saved);
      invalidate();
    },
  });
}

export function useUpdateCounterparty() {
  const invalidate = useInvalidate();
  const store = useStoreSaved();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CounterpartyPatch }) => counterpartiesApi.update(id, patch),
    onSuccess: (saved) => {
      store(saved);
      invalidate();
    },
  });
}

export function useDeleteCounterparty() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => counterpartiesApi.remove(id, version),
    onSuccess: invalidate,
  });
}
