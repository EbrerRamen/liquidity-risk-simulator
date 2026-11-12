import type { ReactNode } from "react";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./Skeleton";
import { Tooltip } from "./Tooltip";

export interface StatProps {
  label: string;
  /** Pre-rendered value: usually <Money compact />, a ratio, or a count. */
  value: ReactNode;
  /** Short context line under the value, e.g. "Next 30 days" or "vs. buffer 250m". */
  caption?: ReactNode;
  /** Change indicator. Direction drives the arrow; `good` drives the colour, because
   *  a rising outflow is bad while a rising inflow is good. */
  delta?: { text: string; direction: "up" | "down"; good: boolean };
  /** Methodology note, shown from an info icon next to the label. */
  info?: ReactNode;
  /** Status flag shown at the top right, e.g. a breach badge. */
  flag?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function Stat({ label, value, caption, delta, info, flag, loading, className }: StatProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface-1 px-4 py-3.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-fg-muted">{label}</span>
          {info && (
            <Tooltip content={info} align="start">
              <Info className="size-3.5 text-fg-faint hover:text-fg-muted" aria-label="About this metric" />
            </Tooltip>
          )}
        </div>
        {flag}
      </div>

      {loading ? (
        <>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3.5 w-20" />
        </>
      ) : (
        <>
          <div className="text-2xl font-semibold tracking-tight text-fg">{value}</div>
          <div className="flex min-h-4 items-center gap-2 text-xs text-fg-faint">
            {delta && (
              <span
                className={cn(
                  "num inline-flex items-center gap-0.5 font-medium",
                  delta.good ? "text-positive" : "text-negative",
                )}
              >
                {delta.direction === "up" ? (
                  <TrendingUp className="size-3.5" aria-hidden />
                ) : (
                  <TrendingDown className="size-3.5" aria-hidden />
                )}
                {delta.text}
              </span>
            )}
            {caption && <span className="truncate">{caption}</span>}
          </div>
        </>
      )}
    </div>
  );
}
