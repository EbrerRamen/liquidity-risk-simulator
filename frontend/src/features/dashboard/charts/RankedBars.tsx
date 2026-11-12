import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface RankedItem {
  id: string;
  label: ReactNode;
  /** 0..1 of the scale maximum: sets the bar length. */
  fraction: number;
  /** Primary figure at the end of the row (e.g. "18.4%"). */
  value: ReactNode;
  /** Secondary figure under or beside the value (e.g. "1.28bn USD"). */
  detail?: ReactNode;
  /** Accessible description, also used as the hover title. */
  description: string;
  /** Emphasis: highlight this row, grey the others (when any row is emphasised). */
  emphasised?: boolean;
  /** Over a limit: the bar takes the warning colour and the row says so in text. */
  flagged?: boolean;
  onSelect?: () => void;
}

/**
 * Ranked horizontal bars in one hue: the dataviz-preferred form for comparing
 * parts (over a donut). Bars share one baseline, cap at 8px thick, and end in a
 * 4px round. An optional limit line marks a threshold across every row.
 */
export function RankedBars({
  items,
  limit,
  labelWidth = "7rem",
}: {
  items: RankedItem[];
  limit?: { fraction: number; label: string };
  labelWidth?: string;
}) {
  const anyEmphasis = items.some((i) => i.emphasised);
  return (
    <div className="relative">
      <ul className="flex flex-col">
        {items.map((i) => {
          const dim = anyEmphasis && !i.emphasised;
          const Row = i.onSelect ? "button" : "div";
          return (
            <li key={i.id}>
              <Row
                {...(i.onSelect ? { type: "button" as const, onClick: i.onSelect } : {})}
                title={i.description}
                aria-label={i.description}
                className={cn(
                  "grid w-full items-center gap-3 rounded-md px-2 py-1.5 text-left",
                  i.onSelect && "hover:bg-surface-2",
                )}
                style={{ gridTemplateColumns: `${labelWidth} 1fr auto` }}
              >
                <span className={cn("truncate text-xs", dim ? "text-fg-faint" : "text-fg")}>{i.label}</span>
                <span className="relative h-2">
                  <span className="absolute inset-0 rounded-full bg-surface-3" aria-hidden />
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      i.flagged ? "bg-warning" : dim ? "bg-fg-faint/50" : "bg-accent",
                    )}
                    style={{ width: `${Math.max(1.5, i.fraction * 100)}%` }}
                    aria-hidden
                  />
                  {limit && (
                    <span
                      className="absolute -inset-y-1 w-px bg-fg-muted"
                      style={{ left: `${limit.fraction * 100}%` }}
                      aria-hidden
                    />
                  )}
                </span>
                <span className="flex min-w-16 flex-col items-end leading-tight">
                  <span className={cn("num text-xs font-semibold", dim ? "text-fg-faint" : "text-fg")}>{i.value}</span>
                  {i.detail && <span className="num text-2xs text-fg-faint">{i.detail}</span>}
                </span>
              </Row>
            </li>
          );
        })}
      </ul>
      {limit && (
        <p className="mt-1 flex items-center gap-1.5 px-2 text-2xs text-fg-faint">
          <span className="inline-block h-3 w-px bg-fg-muted" aria-hidden />
          {limit.label}
        </p>
      )}
    </div>
  );
}
