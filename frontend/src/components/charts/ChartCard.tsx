import { useState, type ReactNode } from "react";
import { ChartColumn, Table2 } from "lucide-react";
import { ErrorState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  /** Legend, shown under the header in chart view. */
  legend?: ReactNode;
  /** Extra header actions, e.g. a drill-down link. */
  actions?: ReactNode;
  /** Plot height in px, including the x-axis band (so the card never scrolls). */
  height: number;
  status: "pending" | "error" | "success";
  /** New data is loading for changed filters: the previous render stays, dimmed. */
  refreshing?: boolean;
  error?: { message: string; requestId?: string };
  onRetry?: () => void;
  chart: () => ReactNode;
  /** Table twin of the chart, so every value is reachable without hovering. */
  table: () => ReactNode;
  footer?: ReactNode;
  /** Let the plot grow to fill a taller grid row (height becomes the minimum). */
  grow?: boolean;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  legend,
  actions,
  height,
  status,
  refreshing,
  error,
  onRetry,
  chart,
  table,
  footer,
  grow = false,
  className,
}: ChartCardProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border border-line bg-surface-1", className)}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-fg-faint">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          <div role="group" aria-label={`${title}: view`} className="flex rounded-md border border-line p-0.5">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={v === "chart" ? "Chart view" : "Table view"}
                title={v === "chart" ? "Chart view" : "Table view"}
                onClick={() => setView(v)}
                className={cn(
                  "flex size-6 items-center justify-center rounded-sm",
                  view === v ? "bg-surface-3 text-fg" : "text-fg-faint hover:text-fg-muted",
                )}
              >
                {v === "chart" ? <ChartColumn className="size-3.5" /> : <Table2 className="size-3.5" />}
              </button>
            ))}
          </div>
        </div>
      </header>
      {legend && view === "chart" && status === "success" && <div className="px-4 pt-2">{legend}</div>}
      <div
        className={cn("relative flex flex-1 flex-col px-2 pt-3 pb-2 transition-opacity duration-200", refreshing && "opacity-50")}
        aria-busy={refreshing || undefined}
      >
        {status === "pending" ? (
          <div className="px-2" style={{ height }}>
            <Skeleton className="h-full w-full" />
          </div>
        ) : status === "error" ? (
          <div style={{ minHeight: height }} className="flex items-center justify-center">
            <ErrorState
              message={error?.message ?? "Something went wrong."}
              requestId={error?.requestId}
              onRetry={onRetry}
              className="py-4"
            />
          </div>
        ) : view === "chart" ? (
          <div className={grow ? "flex-1" : undefined} style={grow ? { minHeight: height } : { height }}>
            {chart()}
          </div>
        ) : (
          <div className="overflow-auto px-2" style={{ height }}>
            {table()}
          </div>
        )}
      </div>
      {footer && <div className="mt-auto border-t border-line px-4 py-2.5 text-xs text-fg-faint">{footer}</div>}
    </section>
  );
}
