import type { ReactNode } from "react";

export type KeyShape = "line" | "dash" | "rect";

export interface TooltipRow {
  key: string;
  label: string;
  value: ReactNode;
  color?: string;
  shape?: KeyShape;
}

/** Tooltip body: the value leads (strong), the series name follows (secondary). */
export function ChartTooltipBox({ title, rows, footer }: { title: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-48 rounded-md bg-surface-3 px-3 py-2 text-xs shadow-pop">
      <div className="mb-1.5 text-fg-muted">{title}</div>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            {r.color ? <Key color={r.color} shape={r.shape ?? "line"} /> : <span className="w-3.5" />}
            <span className="num font-semibold text-fg">{r.value}</span>
            <span className="ml-auto pl-4 text-fg-faint">{r.label}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-1.5 border-t border-line-strong pt-1.5 text-2xs text-fg-faint">{footer}</div>}
    </div>
  );
}

/** Series key that mirrors the mark: a line for lines, dashed for projections, a block for bars. */
export function Key({ color, shape }: { color: string; shape: KeyShape }) {
  if (shape === "rect") return <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden />;
  return (
    <svg width="14" height="4" className="shrink-0" aria-hidden>
      <line
        x1="1"
        x2="13"
        y1="2"
        y2="2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={shape === "dash" ? "3 3" : undefined}
      />
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape: KeyShape }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Key color={i.color} shape={i.shape} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
