import type { MouseEvent, ReactNode } from "react";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { formatSort, type SortSpec } from "@/api/types";
import { ErrorState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    numeric?: boolean;
    /** Header tooltip explaining a derived or abbreviated column. */
    hint?: string;
    /** Fixed width, e.g. "8rem". */
    width?: string;
    /** Hide below a breakpoint to keep narrow screens readable. */
    hideBelow?: "md" | "lg" | "xl" | "2xl";
  }
}

const HIDE: Record<string, string> = { md: "max-md:hidden", lg: "max-lg:hidden", xl: "max-xl:hidden", "2xl": "max-2xl:hidden" };

export interface DataTableProps<T> {
  // Columns carry different value types; TanStack's own examples type the array this way.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  /** Server-side sort; column ids are the API's sort fields. */
  sort: SortSpec[];
  onSortChange: (sort: string) => void;
  status: "pending" | "error" | "success";
  /** Filters changed and new rows are loading: keep the old rows, dimmed. */
  refreshing?: boolean;
  error?: { message: string; requestId?: string };
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  activeRowId?: string | null;
  empty: ReactNode;
  caption: string;
  skeletonRows?: number;
}

/**
 * Server-paginated, server-sorted table (TanStack Table in manual mode).
 * Mouse users click anywhere on a row; keyboard users tab to the row's
 * primary link (rendered by the column), so tab stops stay short.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  status,
  refreshing,
  error,
  onRetry,
  onRowClick,
  activeRowId,
  empty,
  caption,
  skeletonRows = 10,
}: DataTableProps<T>) {
  const sorting: SortingState = sort.map((s) => ({ id: s.field, desc: s.dir === "desc" }));
  const table = useReactTable({
    data: rows ?? [],
    columns,
    getRowId,
    state: { sorting },
    manualSorting: true,
    manualPagination: true,
    enableMultiSort: false,
    sortDescFirst: false,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortChange(formatSort(next.map((s) => ({ field: s.id, dir: s.desc ? "desc" : "asc" }))));
    },
    getCoreRowModel: getCoreRowModel(),
  });

  const onRow = (e: MouseEvent, row: T) => {
    // Clicks on links, buttons or inputs inside a row do their own thing.
    if ((e.target as HTMLElement).closest("a,button,input,select,label")) return;
    onRowClick?.(row);
  };

  const headerGroups = table.getHeaderGroups();
  const colCount = columns.length;

  return (
    <div className={cn("relative overflow-x-auto transition-opacity", refreshing && "opacity-50")} aria-busy={refreshing || status === "pending" || undefined}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-surface-1">
          {headerGroups.map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const meta = h.column.columnDef.meta;
                const canSort = h.column.getCanSort();
                const dir = h.column.getIsSorted();
                const label = flexRender(h.column.columnDef.header, h.getContext());
                return (
                  <th
                    key={h.id}
                    scope="col"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    title={meta?.hint}
                    style={meta?.width ? { width: meta.width } : undefined}
                    className={cn(
                      "h-9 border-b border-line px-3 text-xs font-medium whitespace-nowrap text-fg-faint first:pl-4 last:pr-4",
                      meta?.numeric ? "text-right" : "text-left",
                      meta?.hideBelow && HIDE[meta.hideBelow],
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn("-mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-fg", dir && "text-fg", meta?.numeric && "flex-row-reverse")}
                      >
                        {label}
                        {dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : dir === "desc" ? <ArrowDown className="size-3" aria-hidden /> : <ChevronsUpDown className="size-3 opacity-40" aria-hidden />}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {status === "pending" ? (
            Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={i} className="border-b border-line last:border-b-0">
                {columns.map((c, j) => (
                  <td key={j} className={cn("h-10 px-3 first:pl-4 last:pr-4", c.meta?.hideBelow && HIDE[c.meta.hideBelow])}>
                    <Skeleton className={cn("h-3.5", c.meta?.numeric ? "ml-auto w-16" : j === 0 ? "w-40" : "w-20")} />
                  </td>
                ))}
              </tr>
            ))
          ) : status === "error" ? (
            <tr>
              <td colSpan={colCount}>
                <ErrorState message={error?.message ?? "Something went wrong."} requestId={error?.requestId} onRetry={onRetry} />
              </td>
            </tr>
          ) : table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={colCount}>{empty}</td>
            </tr>
          ) : (
            table.getRowModel().rows.map((r) => (
              <tr
                key={r.id}
                onClick={onRowClick ? (e) => onRow(e, r.original) : undefined}
                aria-current={activeRowId === r.id || undefined}
                className={cn(
                  "border-b border-line last:border-b-0",
                  onRowClick && "cursor-pointer hover:bg-surface-2",
                  activeRowId === r.id && "bg-accent-soft hover:bg-accent-soft",
                )}
              >
                {r.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "h-10 px-3 whitespace-nowrap text-fg first:pl-4 last:pr-4",
                        meta?.numeric && "num text-right",
                        meta?.hideBelow && HIDE[meta.hideBelow],
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
