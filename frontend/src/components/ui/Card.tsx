import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Remove body padding, e.g. for edge-to-edge tables. */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Card({ title, subtitle, actions, flush, className, children }: CardProps) {
  const hasHeader = title || subtitle || actions;
  return (
    <section className={cn("rounded-lg border border-line bg-surface-1", className)}>
      {hasHeader && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>}
            {subtitle && <p className="truncate text-xs text-fg-faint">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}
