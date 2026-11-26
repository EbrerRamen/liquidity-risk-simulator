import { useCallback, useMemo, type ReactNode } from "react";
import { Link } from "react-router";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { ArrowRight, RotateCw, ScrollText, SearchX } from "lucide-react";
import { AUDIT_ACTION_LABEL, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, auditLogApi, type AuditAction, type AuditEntry, type AuditFilters } from "@/api/auditLog";
import { isApiError } from "@/api/problem";
import { usersApi } from "@/api/users";
import { ActiveFilters, CopyId, DataTable, DateRangeFilter, DetailSection, KeyValueList, MultiFilter, formatRangeLabel, useListState, type ActiveFilter, type DateRangePreset } from "@/components/data";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, Badge, Button, Drawer, EmptyState, Table, Td, Th, THead, Tr, type Tone } from "@/components/ui";
import { shiftDays } from "@/lib/calendar";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 50;
const col = createColumnHelper<AuditEntry>();

/** Colour only where the action itself is a warning sign; the label always carries the meaning. */
const ACTION_TONE: Partial<Record<AuditAction, Tone>> = { DELETE: "negative", LOGIN_FAILED: "warning", FAIL: "warning" };

const entityLabel = (type: string) => AUDIT_ENTITY_TYPES.find((t) => t.value === type)?.label ?? type;

/** Where the record an entry refers to can be opened, if it still exists. */
function recordLink(e: AuditEntry): string | null {
  if (e.action === "DELETE" || e.action === "EXPORT") return null;
  if (e.entity_type === "settings") return "/admin/settings";
  const path = AUDIT_ENTITY_TYPES.find((t) => t.value === e.entity_type)?.path;
  return path && e.entity_id ? `${path}?id=${encodeURIComponent(e.entity_id)}` : null;
}

function ActionBadge({ action }: { action: AuditAction }) {
  return <Badge tone={ACTION_TONE[action] ?? "neutral"}>{AUDIT_ACTION_LABEL[action]}</Badge>;
}

/** Audit timestamps are real events, so presets count back from today's date (UTC), not the business date. */
function datePresets(): DateRangePreset[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    { label: "Today", from: today, to: today },
    { label: "Last 7 days", from: shiftDays(today, -6), to: today },
    { label: "Last 30 days", from: shiftDays(today, -29), to: today },
  ];
}

function formatValue(v: unknown): ReactNode {
  if (v === null || v === undefined || v === "") return <span className="text-fg-faint">–</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return <span className="font-mono text-xs">{JSON.stringify(v)}</span>;
  return String(v);
}

/* ---------- detail ---------- */

function EntryDetail({ entry, loading, onClose }: { entry: AuditEntry | undefined; loading: boolean; onClose: () => void }) {
  const link = entry ? recordLink(entry) : null;
  const changes = entry?.changes ? Object.entries(entry.changes) : [];
  return (
    <Drawer
      open
      onClose={onClose}
      title={entry ? `${AUDIT_ACTION_LABEL[entry.action]} · ${entityLabel(entry.entity_type)}` : "Audit entry"}
      subtitle={entry && formatDateTime(entry.occurred_at)}
    >
      {!entry ? (
        <div className="p-5">
          {loading ? null : (
            <Alert tone="info" title="This entry isn't in the loaded results">
              Clear the filters or load older entries to find it.
            </Alert>
          )}
        </div>
      ) : (
        <>
          <DetailSection title="Event">
            <p className="mb-3 text-sm text-fg">{entry.summary}</p>
            <KeyValueList
              rows={[
                ["When", <span key="w" title={entry.occurred_at}>{formatDateTime(entry.occurred_at)} <span className="text-fg-faint">({entry.occurred_at.slice(0, 19).replace("T", " ")} UTC)</span></span>],
                ["Who", entry.actor_name ? <Link key="a" to={`/admin/users?id=${entry.actor_user_id}`} className="text-accent hover:text-accent-strong">{entry.actor_name}</Link> : <span key="a" className="text-fg-faint">Not signed in</span>],
                ["Action", <ActionBadge key="ac" action={entry.action} />],
                ["Record", entry.entity_id ? <CopyId key="r" id={entry.entity_id} /> : <span key="r" className="text-fg-faint">{entry.action === "EXPORT" ? "A filtered list" : "–"}</span>],
                ["Request ID", entry.request_id ? <CopyId key="q" id={entry.request_id} /> : "–"],
                ["IP address", <span key="ip" className="font-mono text-xs">{entry.ip_address ?? "–"}</span>],
              ]}
            />
            {link ? (
              <Link to={link} className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-strong">
                Open the {entityLabel(entry.entity_type).toLowerCase()}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : (
              entry.action === "DELETE" && <p className="mt-3 text-xs text-fg-faint">The record was deleted. This entry is what remains of it.</p>
            )}
          </DetailSection>
          {changes.length > 0 && (
            <DetailSection title={`Changes (${changes.length})`}>
              <Table>
                <THead>
                  <Tr>
                    <Th>Field</Th>
                    <Th>Before</Th>
                    <Th>After</Th>
                  </Tr>
                </THead>
                <tbody>
                  {changes.map(([field, [before, after]]) => (
                    <Tr key={field}>
                      <Td className="font-mono text-xs text-fg-muted">{field}</Td>
                      <Td className="text-fg-muted">{formatValue(before)}</Td>
                      <Td>{formatValue(after)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </DetailSection>
          )}
          {entry.entity_id && (
            <DetailSection title="History">
              <Link to={`/admin/audit?entity_type=${encodeURIComponent(entry.entity_type)}&entity_id=${encodeURIComponent(entry.entity_id)}`} className="text-sm text-accent hover:text-accent-strong">
                Every entry for this record
              </Link>
            </DetailSection>
          )}
        </>
      )}
    </Drawer>
  );
}

/* ---------- page ---------- */

export function AuditLogPage() {
  const list = useListState("");
  const { get, getList, update } = list;
  const filters: AuditFilters = {
    actor: get("actor"),
    action: get("action"),
    entity_type: get("entity_type"),
    entity_id: get("entity_id"),
    from: get("from"),
    to: get("to"),
  };

  const users = useQuery({ queryKey: ["users", "list", "audit-actors"], queryFn: () => usersApi.list({ status: "all", page_size: 200, sort: "full_name" }), staleTime: 5 * 60_000 });
  const actorOptions = (users.data?.items ?? []).map((u) => ({ value: u.id, label: u.is_active ? u.full_name : `${u.full_name} (inactive)` }));
  const actorName = (id: string) => users.data?.items.find((u) => u.id === id)?.full_name ?? id;

  const q = useInfiniteQuery({
    queryKey: ["audit-logs", filters],
    queryFn: ({ pageParam }) => auditLogApi.list({ ...filters, cursor: pageParam ?? undefined, limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items), [q.data]);

  const openId = get("id");
  const open = useCallback((id: number) => update({ id: String(id) }, { push: true }), [update]);

  const columns = useMemo(
    () => [
      col.accessor("occurred_at", {
        header: "When",
        enableSorting: false,
        cell: ({ row }) => (
          <button type="button" onClick={() => open(row.original.id)} className="num rounded-sm text-left text-fg-muted hover:text-fg hover:underline">
            {formatDateTime(row.original.occurred_at)}
          </button>
        ),
        meta: { width: "11rem" },
      }),
      col.accessor("actor_name", {
        header: "Who",
        enableSorting: false,
        cell: (c) => c.getValue() ?? <span className="text-fg-faint">Not signed in</span>,
      }),
      col.accessor("action", { header: "Action", enableSorting: false, cell: (c) => <ActionBadge action={c.getValue()} /> }),
      col.accessor("entity_type", { header: "Record type", enableSorting: false, cell: (c) => <span className="text-fg-muted">{entityLabel(c.getValue())}</span>, meta: { hideBelow: "lg" } }),
      col.accessor("summary", { header: "What happened", enableSorting: false, cell: (c) => <span className="block max-w-[36rem] truncate" title={c.getValue()}>{c.getValue()}</span> }),
    ],
    [open],
  );

  const chips: ActiveFilter[] = [];
  const actors = getList("actor");
  const actions = getList("action");
  const types = getList("entity_type");
  if (actors.length) chips.push({ key: "actor", label: `Who: ${actors.map(actorName).join(", ")}`, onRemove: () => update({ actor: null }) });
  if (actions.length) chips.push({ key: "action", label: `Action: ${actions.map((a) => AUDIT_ACTION_LABEL[a as AuditAction] ?? a).join(", ")}`, onRemove: () => update({ action: null }) });
  if (types.length) chips.push({ key: "entity_type", label: `Record type: ${types.map(entityLabel).join(", ")}`, onRemove: () => update({ entity_type: null }) });
  if (filters.entity_id) chips.push({ key: "entity_id", label: `Record: ${filters.entity_id}`, onRemove: () => update({ entity_id: null }) });
  if (filters.from || filters.to) chips.push({ key: "date", label: `When: ${formatRangeLabel(filters.from, filters.to)}`, onRemove: () => update({ from: null, to: null }) });
  const clearAll = () => update({ actor: null, action: null, entity_type: null, entity_id: null, from: null, to: null });

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every change, sign-in and export, newest first. The trail is append-only: entries can't be edited or deleted."
        actions={
          <Button icon={<RotateCw />} onClick={() => void q.refetch()} loading={q.isRefetching && !q.isFetchingNextPage}>
            Refresh
          </Button>
        }
      />

      <section className="rounded-lg border border-line bg-surface-1" aria-label="Audit log">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <MultiFilter label="Who" options={actorOptions} selected={actors} onChange={(v) => update({ actor: v.join(",") })} />
            <MultiFilter label="Action" options={AUDIT_ACTIONS.map((a) => ({ value: a, label: AUDIT_ACTION_LABEL[a] }))} selected={actions} onChange={(v) => update({ action: v.join(",") })} />
            <MultiFilter label="Record type" options={AUDIT_ENTITY_TYPES.map((t) => ({ value: t.value, label: t.label }))} selected={types} onChange={(v) => update({ entity_type: v.join(",") })} />
            <DateRangeFilter label="When" from={filters.from} to={filters.to} presets={datePresets()} onChange={(from, to) => update({ from, to })} />
            <span className="ml-auto text-2xs text-fg-faint">Times in your time zone · date filters in UTC</span>
          </div>
          <ActiveFilters filters={chips} onClearAll={clearAll} />
        </div>

        <DataTable
          caption="Audit log"
          columns={columns}
          rows={rows}
          getRowId={(r) => String(r.id)}
          sort={[]}
          onSortChange={() => undefined}
          status={q.status}
          refreshing={q.isPlaceholderData}
          error={q.error ? { message: q.error.message, requestId: isApiError(q.error) ? q.error.requestId : undefined } : undefined}
          onRetry={() => void q.refetch()}
          onRowClick={(r) => open(r.id)}
          activeRowId={openId}
          empty={
            chips.length > 0 ? (
              <EmptyState
                icon={<SearchX />}
                title="No entries match these filters"
                description="Try a wider date range or fewer filters."
                action={
                  <Button size="sm" onClick={clearAll}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={<ScrollText />} title="Nothing recorded yet" description="Changes, sign-ins and exports appear here as they happen." />
            )
          }
        />

        {rows && rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-fg-muted">
            <p className="num" aria-live="polite">
              {rows.length.toLocaleString("en")} {rows.length === 1 ? "entry" : "entries"}
              {q.hasNextPage ? " loaded" : chips.length ? "" : " · start of the log"}
            </p>
            {q.hasNextPage && (
              <Button size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                Load older entries
              </Button>
            )}
          </div>
        )}
      </section>

      {openId && <EntryDetail entry={rows?.find((r) => String(r.id) === openId)} loading={q.isPending} onClose={() => update({ id: null })} />}
    </>
  );
}
