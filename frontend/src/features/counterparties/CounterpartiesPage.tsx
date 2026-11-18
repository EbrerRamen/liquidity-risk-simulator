import { useCallback, useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Download, Plus, SearchX, Users } from "lucide-react";
import { isApiError } from "@/api/problem";
import type { CounterpartyFilters, CounterpartyListItem } from "@/api/counterparties";
import { useSession } from "@/app/session";
import { ActiveFilters, DataTable, MultiFilter, Pagination, SearchInput, useListState, type ActiveFilter } from "@/components/data";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge, Button, EmptyState, Money, RiskBadge, SegmentedControl, Tooltip, useToast } from "@/components/ui";
import { downloadText } from "@/lib/download";
import { formatDate } from "@/lib/format";
import { BANDS, BAND_LABEL, COUNTERPARTY_TYPES, COUNTERPARTY_TYPE_LABEL, COUNTRIES, countryName } from "@/mocks/reference";
import { CounterpartyDetail } from "./CounterpartyDetail";
import { CounterpartyEditor } from "./CounterpartyEditor";
import { useCounterpartyList, useExportCounterparties } from "./queries";

const col = createColumnHelper<CounterpartyListItem>();

function useColumns(open: (id: string) => void) {
  return useMemo(
    () => [
      col.accessor("name", {
        header: "Name",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => open(row.original.id)}
              className="max-w-72 truncate rounded-sm text-left font-medium text-fg hover:text-accent-strong hover:underline"
            >
              {row.original.name}
            </button>
            {!row.original.is_active && <Badge>Inactive</Badge>}
          </span>
        ),
      }),
      col.accessor("counterparty_type", {
        header: "Type",
        cell: (c) => <span className="text-fg-muted">{COUNTERPARTY_TYPE_LABEL[c.getValue()]}</span>,
        meta: { hideBelow: "md" },
      }),
      col.accessor("country_code", {
        header: "Country",
        cell: (c) => (
          <span className="text-fg-muted" title={countryName(c.getValue())}>
            <span className="font-mono text-xs text-fg">{c.getValue()}</span> <span className="max-xl:hidden">{countryName(c.getValue())}</span>
          </span>
        ),
        meta: { hideBelow: "lg" },
      }),
      col.accessor("credit_rating", { header: "Rating", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
      col.accessor("risk_classification", {
        header: "Analyst risk",
        cell: (c) => <RiskBadge band={c.getValue()} />,
        meta: { hint: "Analyst-assigned risk classification" },
      }),
      // Derived columns use an accessor function so TanStack treats them as sortable;
      // the id is the API's sort field. Sorting itself happens on the server.
      col.accessor((r) => r.latest_assessment?.band ?? "", {
        id: "model_band",
        header: "Model risk",
        cell: ({ row }) => {
          const a = row.original.latest_assessment;
          if (!a) return <span className="text-xs text-fg-faint">Not assessed</span>;
          const differs = a.band !== row.original.risk_classification;
          return (
            <span className="flex items-center gap-1.5">
              <RiskBadge band={a.band} />
              {differs && (
                <Tooltip content={`Model says ${BAND_LABEL[a.band]}, analyst says ${BAND_LABEL[row.original.risk_classification]}`}>
                  <Badge tone="caution">Differs</Badge>
                </Tooltip>
              )}
            </span>
          );
        },
        meta: { hint: "Latest model assessment band" },
      }),
      col.accessor((r) => r.exposure.funding, {
        id: "funding",
        header: "Funding (USD)",
        cell: ({ row }) =>
          Number(row.original.exposure.funding) === 0 ? <span className="text-fg-faint">–</span> : <Money value={row.original.exposure.funding} currency="USD" compact hideCurrency />,
        meta: { numeric: true, hint: "Funding provided: borrowed principal plus utilised funding, USD equivalent" },
      }),
      col.accessor((r) => r.exposure.credit, {
        id: "credit",
        header: "Credit (USD)",
        cell: ({ row }) =>
          Number(row.original.exposure.credit) === 0 ? <span className="text-fg-faint">–</span> : <Money value={row.original.exposure.credit} currency="USD" compact hideCurrency />,
        meta: { numeric: true, hideBelow: "xl", hint: "Credit exposure: lent principal plus securities issued, USD equivalent" },
      }),
      col.accessor("open_deals", { header: "Deals", meta: { numeric: true, hideBelow: "lg", hint: "Open money-market deals" } }),
      col.accessor("updated_at", {
        header: "Updated",
        cell: (c) => <span className="num text-fg-muted">{formatDate(c.getValue().slice(0, 10))}</span>,
        meta: { hideBelow: "2xl" },
      }),
    ],
    [open],
  );
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
] as const;

export function CounterpartiesPage() {
  const { can } = useSession();
  const toast = useToast();
  const list = useListState("name");
  const exporter = useExportCounterparties();

  const filters: CounterpartyFilters = {
    q: list.get("q"),
    counterparty_type: list.get("counterparty_type"),
    country_code: list.get("country_code"),
    risk_classification: list.get("risk_classification"),
    model_band: list.get("model_band"),
    status: (list.get("status") as CounterpartyFilters["status"]) ?? "active",
    disagreement: list.get("disagreement") === "true",
    sort: list.sortRaw,
    page: list.page,
    page_size: list.pageSize,
  };
  const q = useCounterpartyList(filters);

  // Which panel is open lives in the URL: ?id=… (view), &edit=1 (edit), ?new=1 (create).
  const openId = list.get("id") ?? null;
  const editing = list.get("edit") === "1";
  const creating = list.get("new") === "1";
  const { update } = list;
  const open = useCallback((id: string) => update({ id, edit: null, new: null }, { keepPage: true, push: true }), [update]);
  const closePanel = () => list.update({ id: null, edit: null, new: null }, { keepPage: true });
  const columns = useColumns(open);

  const chips: ActiveFilter[] = [];
  const listChip = (key: string, name: string, label: (v: string) => string) => {
    const vals = list.getList(key);
    if (vals.length) chips.push({ key, label: `${name}: ${vals.map(label).join(", ")}`, onRemove: () => list.update({ [key]: null }) });
  };
  if (filters.q) chips.push({ key: "q", label: `Search: "${filters.q}"`, onRemove: () => list.update({ q: null }) });
  listChip("counterparty_type", "Type", (v) => COUNTERPARTY_TYPE_LABEL[v as keyof typeof COUNTERPARTY_TYPE_LABEL] ?? v);
  listChip("country_code", "Country", (v) => v);
  listChip("risk_classification", "Analyst risk", (v) => BAND_LABEL[v as keyof typeof BAND_LABEL] ?? v);
  listChip("model_band", "Model risk", (v) => BAND_LABEL[v as keyof typeof BAND_LABEL] ?? v);
  if (filters.disagreement) chips.push({ key: "disagreement", label: "Model disagrees", onRemove: () => list.update({ disagreement: null }) });
  const clearAll = () =>
    list.update({ q: null, counterparty_type: null, country_code: null, risk_classification: null, model_band: null, disagreement: null });

  const exportCsv = async () => {
    try {
      const res = await exporter.mutateAsync({ ...filters, page: undefined, page_size: undefined });
      downloadText(res.filename, res.csv);
      toast.show({ tone: "positive", title: `Exported ${res.rows} counterparties`, detail: `${res.filename} · recorded in the audit log` });
    } catch (e) {
      toast.show({ tone: "negative", title: "Export failed", detail: isApiError(e) ? e.message : "Couldn't reach the server." });
    }
  };

  const filtered = chips.length > 0;

  return (
    <>
      <PageHeader
        title="Counterparties"
        description="Banks, corporates, funds and sovereigns you lend to, borrow from or hold securities of."
        actions={
          <>
            <Button icon={<Download />} onClick={() => void exportCsv()} loading={exporter.isPending}>
              Export CSV
            </Button>
            {can("RISK_ANALYST") && (
              <Button variant="primary" icon={<Plus />} onClick={() => list.update({ new: "1", id: null, edit: null }, { keepPage: true, push: true })}>
                New counterparty
              </Button>
            )}
          </>
        }
      />

      <section className="rounded-lg border border-line bg-surface-1" aria-label="Counterparties">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput label="Search counterparties" placeholder="Search name or ID" value={filters.q ?? ""} onChange={(v) => list.update({ q: v })} />
            <MultiFilter
              label="Type"
              options={COUNTERPARTY_TYPES.map((t) => ({ value: t, label: COUNTERPARTY_TYPE_LABEL[t] }))}
              selected={list.getList("counterparty_type")}
              onChange={(v) => list.update({ counterparty_type: v.join(",") })}
            />
            <MultiFilter
              label="Country"
              options={[...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
              selected={list.getList("country_code")}
              onChange={(v) => list.update({ country_code: v.join(",") })}
            />
            <MultiFilter
              label="Analyst risk"
              options={BANDS.map((b) => ({ value: b, label: BAND_LABEL[b] }))}
              selected={list.getList("risk_classification")}
              onChange={(v) => list.update({ risk_classification: v.join(",") })}
            />
            <MultiFilter
              label="Model risk"
              options={BANDS.map((b) => ({ value: b, label: BAND_LABEL[b] }))}
              selected={list.getList("model_band")}
              onChange={(v) => list.update({ model_band: v.join(",") })}
            />
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-2.5 text-sm text-fg-muted hover:text-fg has-checked:border-accent-line has-checked:bg-accent-soft has-checked:text-fg">
              <input
                type="checkbox"
                className="accent-[var(--color-accent)]"
                checked={!!filters.disagreement}
                onChange={(e) => list.update({ disagreement: e.target.checked ? "true" : null })}
              />
              Model disagrees
            </label>
            <div className="ml-auto">
              <SegmentedControl
                label="Status"
                size="sm"
                options={STATUS_OPTIONS}
                value={filters.status ?? "active"}
                onChange={(v) => list.update({ status: v === "active" ? null : v })}
              />
            </div>
          </div>
          <ActiveFilters filters={chips} onClearAll={clearAll} />
        </div>

        <DataTable
          caption="Counterparties"
          columns={columns}
          rows={q.data?.items}
          getRowId={(r) => r.id}
          sort={list.sort}
          onSortChange={(s) => list.update({ sort: s || null })}
          status={q.status}
          refreshing={q.isPlaceholderData}
          error={q.error ? { message: q.error.message, requestId: isApiError(q.error) ? q.error.requestId : undefined } : undefined}
          onRetry={() => void q.refetch()}
          onRowClick={(r) => open(r.id)}
          activeRowId={openId}
          empty={
            filtered ? (
              <EmptyState
                icon={<SearchX />}
                title="No counterparties match these filters"
                description="Try fewer filters or a shorter search."
                action={<Button size="sm" onClick={clearAll}>Clear filters</Button>}
              />
            ) : (
              <EmptyState
                icon={<Users />}
                title={filters.status === "inactive" ? "No inactive counterparties" : "No counterparties yet"}
                description={filters.status === "inactive" ? "Deactivated counterparties appear here." : "Add the banks, corporates and funds you deal with."}
                action={
                  can("RISK_ANALYST") && filters.status !== "inactive" ? (
                    <Button size="sm" variant="primary" icon={<Plus />} onClick={() => list.update({ new: "1" }, { keepPage: true, push: true })}>
                      New counterparty
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />

        {q.data && (
          <Pagination
            noun={["counterparty", "counterparties"]}
            page={q.data.page}
            pageSize={q.data.page_size}
            total={q.data.total}
            onPage={(p) => list.update({ page: p > 1 ? p : null })}
            onPageSize={(s) => list.update({ page_size: s === 25 ? null : s })}
          />
        )}
      </section>

      {creating && can("RISK_ANALYST") && (
        <CounterpartyEditor
          id={null}
          onClose={closePanel}
          onSaved={(saved) => {
            toast.show({ tone: "positive", title: `${saved.name} created` });
            list.update({ new: null, id: saved.id }, { keepPage: true });
          }}
        />
      )}
      {openId && editing && can("RISK_ANALYST") && (
        <CounterpartyEditor
          id={openId}
          onClose={() => list.update({ edit: null }, { keepPage: true })}
          onSaved={(saved) => {
            toast.show({ tone: "positive", title: "Changes saved", detail: `${saved.name} · version ${saved.version}` });
            list.update({ edit: null }, { keepPage: true });
          }}
        />
      )}
      {openId && !editing && (
        <CounterpartyDetail
          id={openId}
          onClose={closePanel}
          onEdit={() => list.update({ edit: "1" }, { keepPage: true })}
          onDeleted={closePanel}
        />
      )}
    </>
  );
}
