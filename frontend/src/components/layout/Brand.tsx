import { cn } from "@/lib/cn";

/** Product glyph: an available-liquidity line rising off a baseline. */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-6 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-surface-3" />
      <path d="M7 21.5h18" className="stroke-line-strong" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 18l5-5 4 3.5L25 9" fill="none" className="stroke-accent" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BrandMark({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn("flex h-12 shrink-0 items-center gap-2.5", collapsed ? "justify-center px-0" : "px-4", className)}>
      <BrandGlyph />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-fg">Liquidity Risk</div>
          <div className="truncate text-2xs text-fg-faint">Simulator</div>
        </div>
      )}
    </div>
  );
}
