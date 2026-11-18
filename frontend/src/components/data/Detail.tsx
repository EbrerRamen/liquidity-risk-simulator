import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Check, Copy } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

/** A titled block inside a detail panel. */
export function DetailSection({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-line px-5 py-4 last:border-b-0", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A labelled figure; becomes a drill-down link when `to` is given. */
export function MetricTile({ label, children, to, sub }: { label: string; children: ReactNode; to?: string; sub?: ReactNode }) {
  const body = (
    <>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-fg">{children}</div>
      {sub && <div className="mt-0.5 text-2xs text-fg-faint">{sub}</div>}
    </>
  );
  return to ? (
    <Link to={to} className="rounded-md border border-line bg-surface-2 px-3 py-2.5 hover:border-line-strong">
      {body}
    </Link>
  ) : (
    <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5">{body}</div>
  );
}

/** Two-column label/value list. */
export function KeyValueList({ rows, labelWidth = "8rem" }: { rows: [string, ReactNode][]; labelWidth?: string }) {
  return (
    <dl className="grid gap-x-3 gap-y-1.5 text-sm" style={{ gridTemplateColumns: `${labelWidth} 1fr` }}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="min-w-0 text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="inline-flex items-center gap-1 rounded-sm font-mono text-xs text-fg-muted hover:text-fg"
      title="Copy"
    >
      {id}
      {copied ? <Check className="size-3 text-positive" aria-label="Copied" /> : <Copy className="size-3" aria-hidden />}
    </button>
  );
}

export interface RecordMeta {
  id: string;
  version: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  is_synthetic?: boolean;
}

/** ID, who/when created and updated, version and source: the same block on every record. */
export function RecordSection({ record, extra = [] }: { record: RecordMeta; extra?: [string, ReactNode][] }) {
  const when = (iso?: string) => (iso ? formatDate(iso.slice(0, 10)) : "—");
  return (
    <DetailSection title="Record">
      <KeyValueList
        labelWidth="7rem"
        rows={[
          ["ID", <CopyId key="id" id={record.id} />],
          ...extra,
          ["Created", `${when(record.created_at)} · ${record.created_by ?? "seed data"}`],
          ["Last updated", `${when(record.updated_at)} · ${record.updated_by ?? "seed data"}`],
          ["Version", <span key="v" className="num">{record.version}</span>],
          ...(record.is_synthetic === undefined ? [] : ([["Source", record.is_synthetic ? "Synthetic (generated)" : "Entered manually"]] as [string, ReactNode][])),
        ]}
      />
    </DetailSection>
  );
}

export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-5">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
