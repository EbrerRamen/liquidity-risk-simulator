import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZES } from "@/api/types";
import { IconButton } from "@/components/ui";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  noun,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** [singular, plural], e.g. ["counterparty", "counterparties"]. */
  noun: [string, string];
}) {
  const word = total === 1 ? noun[0] : noun[1];
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-fg-muted">
      <p className="num" aria-live="polite">
        {total === 0 ? `No ${noun[1]}` : `${from.toLocaleString("en")}–${to.toLocaleString("en")} of ${total.toLocaleString("en")} ${word}`}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-fg-faint">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="num h-7 rounded-md border border-line-strong bg-surface-2 px-1.5 text-xs text-fg focus:border-accent focus:outline-none"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <span className="num text-fg-faint">
          Page {page} of {pages}
        </span>
        <div className="flex items-center">
          <IconButton label="Previous page" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="Next page" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight />
          </IconButton>
        </div>
      </div>
    </nav>
  );
}
