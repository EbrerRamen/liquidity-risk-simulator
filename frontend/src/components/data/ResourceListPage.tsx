import { useCallback, useMemo, type ReactNode } from "react";
import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Plus, SearchX } from "lucide-react";
import { isApiError } from "@/api/problem";
import type { Page } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, EmptyState, SegmentedControl, useToast } from "@/components/ui";
import { downloadText } from "@/lib/download";
import { DataTable } from "./DataTable";
import { ActiveFilters, DateRangeFilter, MultiFilter, SearchInput, formatRangeLabel, type ActiveFilter, type DateRangePreset, type FilterOption } from "./Filters";
import { Pagination } from "./Pagination";
import { useListState, type DefaultSort } from "./useListState";

export type ListParams = Record<string, string | number | boolean | undefined>;

export type FilterDef =
  | { kind: "multi"; key: string; label: string; options: FilterOption[] }
  | { kind: "toggle"; key: string; label: string }
  /** URL keys are `${key}_from` and `${key}_to`. */
  | { kind: "dateRange"; key: string; label: string; presets: DateRangePreset[] }
  /** Shown at the right of the toolbar; never a chip. */
  | { kind: "segmented"; key: string; label: string; options: readonly { value: string; label: string }[]; defaultValue: string; resetSort?: boolean }
  /** Set only by links from other screens (e.g. ?deal_id=); shown as a removable chip. */
  | { kind: "hidden"; key: string; chip: (value: string) => string };

export interface PanelNav {
  /** Close whatever panel is open. */
  close: () => void;
  /** Open a record's detail panel. */
  view: (id: string) => void;
  /** Switch the open record to edit mode. */
  edit: () => void;
  /** Leave the editor: back to the record (edit) or closed (create). */
  closeEditor: () => void;
}

export interface ResourceListPageProps<Item> {
  title: string;
  description: string;
  noun: [string, string];
  searchPlaceholder?: string;
  filters: FilterDef[];
  defaultSort: DefaultSort;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: (open: (id: string) => void) => ColumnDef<Item, any>[];
  rowId: (row: Item) => string;
  /** The list request for the current filters, sort and page. Previous rows stay visible while the next page loads. */
  listQuery: (params: ListParams) => { queryKey: QueryKey; queryFn: () => Promise<Page<Item>> };
  exportCsv?: (params: ListParams) => Promise<{ filename: string; csv: string; rows: number }>;
  createLabel?: string;
  canCreate?: boolean;
  canEdit?: boolean;
  renderDetail?: (id: string, nav: PanelNav) => ReactNode;
  renderEditor?: (id: string | null, nav: PanelNav) => ReactNode;
  /** Summary strip between the header and the table, scoped by the same filters. */
  summary?: (params: ListParams) => ReactNode;
  headerActions?: ReactNode;
  empty: { icon: ReactNode; title: string; description: string };
}

export function ResourceListPage<Item>({
  title,
  description,
  noun,
  searchPlaceholder,
  filters,
  defaultSort,
  columns,
  rowId,
  listQuery,
  exportCsv,
  createLabel,
  canCreate = false,
  canEdit = false,
  renderDetail,
  renderEditor,
  summary,
  headerActions,
  empty,
}: ResourceListPageProps<Item>) {
  const toast = useToast();
  const list = useListState(defaultSort);
  const { update } = list;

  const params: ListParams = { sort: list.sortRaw, page: list.page, page_size: list.pageSize };
  if (searchPlaceholder) params.q = list.get("q");
  for (const f of filters) {
    if (f.kind === "multi" || f.kind === "hidden") params[f.key] = list.get(f.key);
    else if (f.kind === "toggle") params[f.key] = list.get(f.key) === "true" ? true : undefined;
    else if (f.kind === "dateRange") {
      params[`${f.key}_from`] = list.get(`${f.key}_from`);
      params[`${f.key}_to`] = list.get(`${f.key}_to`);
    } else params[f.key] = list.get(f.key) ?? f.defaultValue;
  }
  const q = useQuery({ ...listQuery(params), placeholderData: keepPreviousData });

  // Panels live in the URL: ?id= (view), &edit=1 (edit), ?new=1 (create).
  const openId = list.get("id") ?? null;
  const editing = list.get("edit") === "1";
  const creating = list.get("new") === "1";
  const view = useCallback((id: string) => update({ id, edit: null, new: null }, { keepPage: true, push: true }), [update]);
  const nav: PanelNav = {
    close: () => update({ id: null, edit: null, new: null }, { keepPage: true }),
    view: (id) => update({ id, edit: null, new: null }, { keepPage: true }),
    edit: () => update({ edit: "1" }, { keepPage: true }),
    closeEditor: () => (creating ? update({ new: null }, { keepPage: true }) : update({ edit: null }, { keepPage: true })),
  };
  const cols = useMemo(() => columns(view), [columns, view]);

  // Chips for every active filter except segmented views.
  const chips: ActiveFilter[] = [];
  if (params.q) chips.push({ key: "q", label: `Search: "${params.q}"`, onRemove: () => update({ q: null }) });
  const clearKeys: Record<string, null> = { q: null };
  for (const f of filters) {
    if (f.kind === "multi") {
      clearKeys[f.key] = null;
      const vals = list.getList(f.key);
      if (vals.length) chips.push({ key: f.key, label: `${f.label}: ${vals.map((v) => f.options.find((o) => o.value === v)?.label ?? v).join(", ")}`, onRemove: () => update({ [f.key]: null }) });
    } else if (f.kind === "toggle") {
      clearKeys[f.key] = null;
      if (params[f.key]) chips.push({ key: f.key, label: f.label, onRemove: () => update({ [f.key]: null }) });
    } else if (f.kind === "dateRange") {
      clearKeys[`${f.key}_from`] = null;
      clearKeys[`${f.key}_to`] = null;
      const from = list.get(`${f.key}_from`);
      const to = list.get(`${f.key}_to`);
      if (from || to) chips.push({ key: f.key, label: `${f.label}: ${formatRangeLabel(from, to)}`, onRemove: () => update({ [`${f.key}_from`]: null, [`${f.key}_to`]: null }) });
    } else if (f.kind === "hidden") {
      clearKeys[f.key] = null;
      const v = list.get(f.key);
      if (v) chips.push({ key: f.key, label: f.chip(v), onRemove: () => update({ [f.key]: null }) });
    }
  }
  const clearAll = () => update(clearKeys);

  const runExport = async () => {
    if (!exportCsv) return;
    try {
      const res = await exportCsv({ ...params, page: undefined, page_size: undefined });
      downloadText(res.filename, res.csv);
      toast.show({ tone: "positive", title: `Exported ${res.rows} ${res.rows === 1 ? noun[0] : noun[1]}`, detail: `${res.filename} · recorded in the audit log` });
    } catch (e) {
      toast.show({ tone: "negative", title: "Export failed", detail: isApiError(e) ? e.message : "Couldn't reach the server." });
    }
  };

  const segmented = filters.filter((f): f is Extract<FilterDef, { kind: "segmented" }> => f.kind === "segmented");
  // Hidden filters only produce chips; with nothing else to show, skip the toolbar band entirely.
  const hasToolbar = !!searchPlaceholder || filters.some((f) => f.kind !== "hidden") || chips.length > 0;

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {headerActions}
            {exportCsv && (
              <Button icon={<Download />} onClick={() => void runExport()}>
                Export CSV
              </Button>
            )}
            {canCreate && renderEditor && (
              <Button variant="primary" icon={<Plus />} onClick={() => update({ new: "1", id: null, edit: null }, { keepPage: true, push: true })}>
                {createLabel ?? `New ${noun[0]}`}
              </Button>
            )}
          </>
        }
      />

      {summary?.(params)}

      <section className="rounded-lg border border-line bg-surface-1" aria-label={title}>
        {hasToolbar && (
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {searchPlaceholder && (
              <SearchInput label={`Search ${noun[1]}`} placeholder={searchPlaceholder} value={(params.q as string) ?? ""} onChange={(v) => update({ q: v })} />
            )}
            {filters.map((f) => {
              if (f.kind === "multi")
                return <MultiFilter key={f.key} label={f.label} options={f.options} selected={list.getList(f.key)} onChange={(v) => update({ [f.key]: v.join(",") })} />;
              if (f.kind === "dateRange")
                return (
                  <DateRangeFilter
                    key={f.key}
                    label={f.label}
                    from={list.get(`${f.key}_from`)}
                    to={list.get(`${f.key}_to`)}
                    presets={f.presets}
                    onChange={(from, to) => update({ [`${f.key}_from`]: from, [`${f.key}_to`]: to })}
                  />
                );
              if (f.kind === "toggle")
                return (
                  <label
                    key={f.key}
                    className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-2.5 text-sm text-fg-muted hover:text-fg has-checked:border-accent-line has-checked:bg-accent-soft has-checked:text-fg"
                  >
                    <input type="checkbox" className="accent-[var(--color-accent)]" checked={!!params[f.key]} onChange={(e) => update({ [f.key]: e.target.checked ? "true" : null })} />
                    {f.label}
                  </label>
                );
              return null;
            })}
            {segmented.length > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {segmented.map((f) => (
                  <SegmentedControl
                    key={f.key}
                    label={f.label}
                    size="sm"
                    options={f.options}
                    value={String(params[f.key])}
                    onChange={(v) => update({ [f.key]: v === f.defaultValue ? null : v, ...(f.resetSort ? { sort: null } : {}) })}
                  />
                ))}
              </div>
            )}
          </div>
          <ActiveFilters filters={chips} onClearAll={clearAll} />
        </div>
        )}

        <DataTable
          caption={title}
          columns={cols}
          rows={q.data?.items}
          getRowId={rowId}
          sort={list.sort}
          onSortChange={(s) => update({ sort: s || null })}
          status={q.status}
          refreshing={q.isPlaceholderData}
          error={q.error ? { message: q.error.message, requestId: isApiError(q.error) ? q.error.requestId : undefined } : undefined}
          onRetry={() => void q.refetch()}
          onRowClick={renderDetail ? (r) => view(rowId(r)) : undefined}
          activeRowId={openId}
          empty={
            chips.length > 0 ? (
              <EmptyState
                icon={<SearchX />}
                title={`No ${noun[1]} match these filters`}
                description="Try fewer filters or a shorter search."
                action={
                  <Button size="sm" onClick={clearAll}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
            )
          }
        />

        {q.data && (
          <Pagination
            noun={noun}
            page={q.data.page}
            pageSize={q.data.page_size}
            total={q.data.total}
            onPage={(p) => update({ page: p > 1 ? p : null })}
            onPageSize={(s) => update({ page_size: s === 25 ? null : s })}
          />
        )}
      </section>

      {creating && canCreate && renderEditor?.(null, nav)}
      {openId && editing && canEdit && renderEditor?.(openId, nav)}
      {openId && !(editing && canEdit) && renderDetail?.(openId, nav)}
    </>
  );
}
