import { useCallback } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { ArrowLeftRight } from "lucide-react";
import { dealsApi, type DealFilters, type DealItem } from "@/api/deals";
import { useSession } from "@/app/session";
import { ResourceListPage, type ListParams } from "@/components/data";
import { Money, Skeleton } from "@/components/ui";
import { daysBetween } from "@/lib/dates";
import { formatDate, formatPercent } from "@/lib/format";
import { CURRENCY_LIST, DEAL_STATUSES, DEAL_STATUS_LABEL, DEAL_TYPES, DEAL_TYPE_LABEL } from "@/mocks/reference";
import { DealDirection, DealStatusBadge, futurePresets, useCan, useCounterpartyOptions } from "../data-shared/shared";
import { DealDetail } from "./DealDetail";
import { DealEditor } from "./DealEditor";

const col = createColumnHelper<DealItem>();

function DealSummaryStrip({ params }: { params: ListParams }) {
  const q = useQuery({ queryKey: ["deals", "summary", { ...params, page: undefined, page_size: undefined, sort: undefined }], queryFn: () => dealsApi.summary(params as DealFilters), placeholderData: keepPreviousData });
  const s = q.data;
  const cell = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="truncate text-base font-semibold text-fg">{value}</div>
      {sub && <div className="truncate text-xs text-fg-faint">{sub}</div>}
    </div>
  );
  if (!s) return <Skeleton className="mb-4 h-[74px] w-full rounded-lg" />;
  return (
    <div className="mb-4 grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1 md:grid-cols-4 md:divide-y-0" aria-label="Deal summary">
      {cell("Live deals", <span className="num">{s.live}</span>, "Pending or settled, matching the filters")}
      {cell("Borrowed", <Money value={s.borrowed} currency={s.base_currency} compact tabular={false} />, "Outstanding principal, USD equivalent")}
      {cell("Lent", <Money value={s.lent} currency={s.base_currency} compact tabular={false} />, "Outstanding principal, USD equivalent")}
      {cell(
        "Maturing in 30 days",
        <span className="num">{s.maturing_30d}</span>,
        s.next_maturity ? (
          <>
            Next: <Link to={`/data/deals?id=${s.next_maturity.deal_id}`} className="font-mono text-accent hover:text-accent-strong">{s.next_maturity.reference}</Link> on {formatDate(s.next_maturity.date)}
          </>
        ) : (
          "None"
        ),
      )}
    </div>
  );
}

export function DealsPage() {
  const { system } = useSession();
  const can = useCan();
  const cps = useCounterpartyOptions();
  const t0 = system.businessDate;

  const columns = useCallback(
    (open: (id: string) => void) => [
      col.accessor("deal_reference", {
        header: "Reference",
        cell: ({ row }) => (
          <button type="button" onClick={() => open(row.original.id)} className="rounded-sm font-mono text-xs text-accent-strong hover:underline">
            {row.original.deal_reference}
          </button>
        ),
      }),
      col.accessor("counterparty_name", { id: "counterparty", header: "Counterparty", cell: (c) => <span className="block max-w-56 truncate">{c.getValue()}</span> }),
      col.accessor("direction", { header: "Direction", cell: (c) => <DealDirection direction={c.getValue()} /> }),
      col.accessor("deal_type", { header: "Type", cell: (c) => <span className="text-fg-muted">{DEAL_TYPE_LABEL[c.getValue()]}</span>, meta: { hideBelow: "2xl" } }),
      col.accessor("principal", {
        header: "Principal",
        cell: ({ row }) => <Money value={row.original.principal} currency={row.original.currency_code} />,
        meta: { numeric: true, hint: "Sorted by USD equivalent" },
      }),
      col.accessor("interest_rate", {
        header: "Rate",
        cell: (c) => <span className={c.getValue().startsWith("-") ? "text-negative" : undefined}>{formatPercent(c.getValue(), { dp: 3 })}</span>,
        meta: { numeric: true },
      }),
      col.accessor("value_date", { header: "Value date", cell: (c) => <span className="num text-fg-muted">{formatDate(c.getValue())}</span>, meta: { hideBelow: "lg" } }),
      col.accessor("maturity_date", {
        header: "Maturity",
        cell: (c) => {
          const d = daysBetween(t0, c.getValue());
          return (
            <span className="num">
              {formatDate(c.getValue())}
              {d > 0 && d <= 90 && <span className="ml-1.5 text-xs text-fg-faint">in {d}d</span>}
            </span>
          );
        },
      }),
      col.accessor("settlement_status", { header: "Status", cell: ({ row }) => <DealStatusBadge status={row.original.settlement_status} locked={row.original.locked} /> }),
    ],
    [t0],
  );

  return (
    <ResourceListPage<DealItem>
      title="MM Deals"
      description="Money-market lending and borrowing. Each deal generates its cash-flow schedule from its terms."
      noun={["deal", "deals"]}
      searchPlaceholder="Search reference or counterparty"
      defaultSort="maturity_date"
      filters={[
        { kind: "multi", key: "currency_code", label: "Currency", options: CURRENCY_LIST.map((c) => ({ value: c, label: c })) },
        { kind: "multi", key: "direction", label: "Direction", options: [{ value: "LEND", label: "Lend" }, { value: "BORROW", label: "Borrow" }] },
        { kind: "multi", key: "deal_type", label: "Type", options: DEAL_TYPES.map((t) => ({ value: t, label: DEAL_TYPE_LABEL[t] })) },
        { kind: "multi", key: "settlement_status", label: "Status", options: DEAL_STATUSES.map((s) => ({ value: s, label: DEAL_STATUS_LABEL[s] })) },
        { kind: "multi", key: "counterparty_id", label: "Counterparty", options: cps.filterOptions },
        { kind: "dateRange", key: "maturity", label: "Maturity", presets: futurePresets(t0) },
        {
          kind: "segmented",
          key: "scope",
          label: "Deals shown",
          defaultValue: "live",
          options: [
            { value: "live", label: "Live" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ],
        },
      ]}
      columns={columns}
      rowId={(r) => r.id}
      useList={(p) => useQuery({ queryKey: ["deals", "list", p], queryFn: () => dealsApi.list(p as DealFilters), placeholderData: keepPreviousData })}
      exportCsv={(p) => dealsApi.exportCsv(p as DealFilters)}
      summary={(p) => <DealSummaryStrip params={p} />}
      canCreate={can.analyst}
      canEdit={can.analyst}
      createLabel="Book deal"
      renderDetail={(id, nav) => <DealDetail id={id} nav={nav} />}
      renderEditor={(id, nav) => <DealEditor id={id} nav={nav} />}
      empty={{ icon: <ArrowLeftRight />, title: "No deals yet", description: "Book a money-market deal to see its cash-flow schedule here." }}
    />
  );
}

