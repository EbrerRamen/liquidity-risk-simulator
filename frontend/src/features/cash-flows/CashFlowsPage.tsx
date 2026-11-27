import { useCallback } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { ArrowDownUp } from "lucide-react";
import { cashFlowsApi, type CashFlowFilters, type CashFlowItem, type CashFlowView } from "@/api/cashFlows";
import { dealsApi } from "@/api/deals";
import { useSession } from "@/app/session";
import { ResourceListPage, useListState, type ListParams } from "@/components/data";
import { Money, Skeleton } from "@/components/ui";
import { formatCompact, formatDate } from "@/lib/format";
import { CF_CATEGORIES, CF_CATEGORY_LABEL, CF_SOURCES, CF_SOURCE_LABEL, CURRENCY_LIST } from "@/mocks/reference";
import { CashFlowStatusBadge, FlowDirection, mixedPresets, useCan, useCounterpartyOptions } from "../data-shared/shared";
import { CashFlowDetail } from "./CashFlowDetail";
import { CashFlowEditor } from "./CashFlowEditor";

const col = createColumnHelper<CashFlowItem>();
const VIEWS: { value: CashFlowView; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
  { value: "settled", label: "Settled" },
  { value: "all", label: "All" },
];
/** Default sort per view: upcoming and overdue soonest first, settled newest first. */
const defaultSort = (p: URLSearchParams) => {
  const view = (p.get("view") as CashFlowView) ?? "upcoming";
  return view === "settled" ? "-actual_date" : view === "all" ? "-expected_date" : "expected_date";
};

function SummaryStrip({ params }: { params: ListParams }) {
  const { update } = useListState(defaultSort);
  const q = useQuery({
    queryKey: ["cash-flows", "summary", params.currency_code],
    queryFn: () => cashFlowsApi.summary({ currency_code: params.currency_code as string | undefined }),
    placeholderData: keepPreviousData,
  });
  const s = q.data;
  if (!s) return <Skeleton className="mb-4 h-[74px] w-full rounded-lg" />;
  const ccy = s.base_currency;
  const tile = (view: CashFlowView, label: string, main: React.ReactNode, sub: React.ReactNode) => (
    <button
      type="button"
      onClick={() => update({ view: view === "upcoming" ? null : view, sort: null })}
      aria-pressed={(params.view ?? "upcoming") === view}
      className="min-w-0 px-4 py-3 text-left hover:bg-surface-2 aria-pressed:bg-accent-soft"
    >
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="truncate text-base font-semibold text-fg">{main}</div>
      <div className="truncate text-xs text-fg-faint">{sub}</div>
    </button>
  );
  return (
    <div className="mb-4 grid divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1 md:grid-cols-3 md:divide-x md:divide-y-0" aria-label="Cash flow summary">
      {tile(
        "upcoming",
        "Upcoming",
        <>
          <span className="num">{s.upcoming.count.toLocaleString("en")}</span> <span className="text-sm font-normal text-fg-muted">projected</span>
        </>,
        `In ${formatCompact(s.upcoming.inflows)} · Out ${formatCompact(s.upcoming.outflows)} ${ccy}`,
      )}
      {tile(
        "overdue",
        "Overdue",
        <>
          <span className="num">{s.overdue.count}</span> <span className="text-sm font-normal text-fg-muted">past expected date</span>
        </>,
        `${formatCompact(s.overdue.inflows)} ${ccy} inflows excluded · outflows land on day 1`,
      )}
      {tile(
        "settled",
        `Settled since ${formatDate(s.settled_since)}`,
        <>
          <span className="num">{s.settled.count.toLocaleString("en")}</span> <span className="text-sm font-normal text-fg-muted">settled</span>
        </>,
        `In ${formatCompact(s.settled.inflows)} · Out ${formatCompact(s.settled.outflows)} ${ccy}`,
      )}
    </div>
  );
}

export function CashFlowsPage() {
  const { system } = useSession();
  const can = useCan();
  const cps = useCounterpartyOptions();
  const list = useListState(defaultSort);
  const dealId = list.get("deal_id");
  const deal = useQuery({ queryKey: ["deals", "detail", dealId], queryFn: () => dealsApi.get(dealId!), enabled: !!dealId });

  const columns = useCallback(
    (open: (id: string) => void) => [
      col.accessor("expected_date", {
        header: "Expected",
        cell: ({ row }) => <span className="num">{formatDate(row.original.expected_date)}</span>,
      }),
      col.accessor("transaction_reference", {
        header: "Reference",
        cell: ({ row }) => (
          <button type="button" onClick={() => open(row.original.id)} className="rounded-sm font-mono text-xs text-accent-strong hover:underline">
            {row.original.transaction_reference}
          </button>
        ),
        meta: { hideBelow: "lg" },
      }),
      col.accessor("direction", { header: "Direction", cell: (c) => <FlowDirection direction={c.getValue()} /> }),
      col.accessor("category", { header: "Category", cell: (c) => <span className="text-fg-muted">{CF_CATEGORY_LABEL[c.getValue()]}</span> }),
      col.display({
        id: "party",
        header: "Deal / counterparty",
        cell: ({ row }) =>
          row.original.deal_id ? (
            <Link to={`/data/deals?id=${row.original.deal_id}`} className="font-mono text-xs text-accent hover:text-accent-strong">
              {row.original.deal_reference}
            </Link>
          ) : row.original.counterparty_name ? (
            <span className="block max-w-48 truncate text-fg-muted">{row.original.counterparty_name}</span>
          ) : (
            <span className="text-fg-faint">–</span>
          ),
      }),
      col.accessor("amount", {
        header: "Amount",
        cell: ({ row }) => {
          const r = row.original;
          const differs = r.settled_amount !== null && Number(r.settled_amount) !== Number(r.amount);
          return (
            <span className="flex flex-col items-end leading-tight">
              <Money value={(r.direction === "OUT" ? "-" : "") + (r.settled_amount ?? r.amount)} currency={r.currency_code} colored={false} />
              {differs && <span className="text-2xs text-fg-faint line-through">{Number(r.amount).toLocaleString("en", { minimumFractionDigits: r.currency_code === "JPY" ? 0 : 2 })}</span>}
            </span>
          );
        },
        meta: { numeric: true, hint: "Settled amount when settled. Outflows shown negative. Sorted by USD equivalent" },
      }),
      col.accessor("actual_date", {
        header: "Settled",
        cell: (c) => (c.getValue() ? <span className="num text-fg-muted">{formatDate(c.getValue()!)}</span> : <span className="text-fg-faint">–</span>),
        meta: { hideBelow: "xl" },
      }),
      col.accessor("status", { header: "Status", cell: ({ row }) => <CashFlowStatusBadge status={row.original.status} overdue={row.original.overdue} /> }),
      col.accessor("source", { header: "Source", enableSorting: false, cell: (c) => <span className="text-xs text-fg-faint">{CF_SOURCE_LABEL[c.getValue()]}</span>, meta: { hideBelow: "2xl" } }),
    ],
    [],
  );

  return (
    <ResourceListPage<CashFlowItem>
      title="Cash Flows"
      description="Every expected and settled payment: deal schedules, client flows and manual entries. Settle or fail them as they happen."
      noun={["cash flow", "cash flows"]}
      searchPlaceholder="Search reference, deal or counterparty"
      defaultSort={defaultSort}
      filters={[
        { kind: "segmented", key: "view", label: "View", defaultValue: "upcoming", options: VIEWS, resetSort: true },
        { kind: "multi", key: "currency_code", label: "Currency", options: CURRENCY_LIST.map((c) => ({ value: c, label: c })) },
        { kind: "multi", key: "direction", label: "Direction", options: [{ value: "IN", label: "In" }, { value: "OUT", label: "Out" }] },
        { kind: "multi", key: "category", label: "Category", options: CF_CATEGORIES.map((c) => ({ value: c, label: CF_CATEGORY_LABEL[c] })) },
        { kind: "multi", key: "source", label: "Source", options: CF_SOURCES.map((s) => ({ value: s, label: CF_SOURCE_LABEL[s] })) },
        { kind: "multi", key: "counterparty_id", label: "Counterparty", options: cps.filterOptions },
        { kind: "dateRange", key: "expected", label: "Expected", presets: mixedPresets(system.businessDate) },
        { kind: "hidden", key: "deal_id", chip: () => `Deal: ${deal.data?.deal_reference ?? "…"}` },
      ]}
      columns={columns}
      rowId={(r) => r.id}
      listQuery={(p) => ({ queryKey: ["cash-flows", "list", p], queryFn: () => cashFlowsApi.list(p as CashFlowFilters) })}
      exportCsv={(p) => cashFlowsApi.exportCsv(p as CashFlowFilters)}
      summary={(p) => <SummaryStrip params={p} />}
      canCreate={can.analyst}
      canEdit={can.analyst}
      createLabel="New manual flow"
      renderDetail={(id, nav) => <CashFlowDetail id={id} nav={nav} />}
      renderEditor={(id, nav) => <CashFlowEditor id={id} nav={nav} />}
      empty={{ icon: <ArrowDownUp />, title: "No cash flows in this view", description: "Try another view, or add a manual flow." }}
    />
  );
}
