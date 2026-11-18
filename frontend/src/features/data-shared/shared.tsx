import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Lock } from "lucide-react";
import { counterpartiesApi } from "@/api/counterparties";
import { useSession } from "@/app/session";
import type { DateRangePreset, FilterOption } from "@/components/data";
import { Badge, Tooltip, type Tone } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { COUNTERPARTY_TYPE_LABEL, COUNTERPARTY_TYPES, DEAL_STATUS_LABEL, type DealStatus } from "@/mocks/reference";

/* ---------- counterparty choices (filters and pickers) ---------- */

export function useCounterpartyOptions() {
  const q = useQuery({
    queryKey: ["counterparties", "options"],
    queryFn: () => counterpartiesApi.list({ status: "all", page_size: 200, sort: "name" }),
    staleTime: 5 * 60_000,
  });
  const all = q.data?.items ?? [];
  const filterOptions: FilterOption[] = all.map((c) => ({ value: c.id, label: c.is_active ? c.name : `${c.name} (inactive)` }));
  /** Active counterparties grouped by type, for <optgroup> pickers. */
  const groups = COUNTERPARTY_TYPES.map((t) => ({ label: COUNTERPARTY_TYPE_LABEL[t], items: all.filter((c) => c.is_active && c.counterparty_type === t) })).filter((g) => g.items.length > 0);
  const nameOf = (id: string | null | undefined) => (id ? (all.find((c) => c.id === id)?.name ?? id) : "");
  return { loading: q.isPending, filterOptions, groups, nameOf };
}

/** <option>s for a counterparty <select>, grouped by type. */
export function CounterpartyOptions({ groups }: { groups: ReturnType<typeof useCounterpartyOptions>["groups"] }) {
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/* ---------- date presets relative to the business date ---------- */

export function futurePresets(t0: string): DateRangePreset[] {
  return [
    { label: "Next 7 days", from: addDays(t0, 1), to: addDays(t0, 7) },
    { label: "Next 30 days", from: addDays(t0, 1), to: addDays(t0, 30) },
    { label: "Next 90 days", from: addDays(t0, 1), to: addDays(t0, 90) },
    { label: "Next 12 months", from: addDays(t0, 1), to: addDays(t0, 365) },
  ];
}

export function mixedPresets(t0: string): DateRangePreset[] {
  return [
    { label: "Business date only", from: t0, to: t0 },
    { label: "Next 7 days", from: addDays(t0, 1), to: addDays(t0, 7) },
    { label: "Next 30 days", from: addDays(t0, 1), to: addDays(t0, 30) },
    { label: "Last 7 days", from: addDays(t0, -6), to: t0 },
    { label: "Last 30 days", from: addDays(t0, -29), to: t0 },
  ];
}

/* ---------- badges ---------- */

const DEAL_TONE: Record<DealStatus, Tone> = { PENDING: "accent", SETTLED: "positive", MATURED: "neutral", CANCELLED: "neutral", FAILED: "negative" };

export function DealStatusBadge({ status, locked }: { status: DealStatus; locked?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={DEAL_TONE[status]} dot>
        {DEAL_STATUS_LABEL[status]}
      </Badge>
      {locked && (status === "SETTLED" || status === "PENDING") && (
        <Tooltip content="Terms locked: cash flows have settled">
          <Lock className="size-3.5 text-fg-faint" aria-label="Terms locked" />
        </Tooltip>
      )}
    </span>
  );
}

export function CashFlowStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) return <Badge tone="warning" dot>Overdue</Badge>;
  const map: Record<string, [Tone, string]> = {
    PROJECTED: ["accent", "Projected"],
    SETTLED: ["positive", "Settled"],
    FAILED: ["negative", "Failed"],
    CANCELLED: ["neutral", "Cancelled"],
  };
  const [tone, label] = map[status] ?? ["neutral", status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

/** Money in or out. The arrow and word carry the meaning; colour stays neutral. */
export function FlowDirection({ direction }: { direction: "IN" | "OUT" }) {
  return direction === "IN" ? (
    <span className="inline-flex items-center gap-1 text-fg-muted">
      <ArrowDownLeft className="size-3.5 text-[var(--color-series-in)]" aria-hidden />
      In
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-fg-muted">
      <ArrowUpRight className="size-3.5 text-[var(--color-series-out)]" aria-hidden />
      Out
    </span>
  );
}

export function DealDirection({ direction }: { direction: "LEND" | "BORROW" }) {
  return <Badge>{direction === "LEND" ? "Lend" : "Borrow"}</Badge>;
}

/* ---------- writes ---------- */

/**
 * A write that refreshes every cached view afterwards. All mock data lives in
 * one database, so a settled flow or cancelled deal changes balances, the
 * projection and the dashboard together; refreshing everything keeps every
 * open screen consistent.
 */
export function useWrite<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries() });
}

export function useCan() {
  const { can } = useSession();
  return { analyst: can("RISK_ANALYST"), admin: can("ADMIN") };
}
