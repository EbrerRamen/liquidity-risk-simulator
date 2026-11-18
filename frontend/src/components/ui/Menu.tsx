import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Why it is disabled, shown as the item's tooltip. */
  hint?: string;
}

/** Small action menu. Arrow keys move, Enter selects, Esc closes and returns focus. */
export function Menu({ trigger, items, label }: { trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode; items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const next = btns[(i + (e.key === "ArrowDown" ? 1 : btns.length - 1)) % btns.length];
        next?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div ref={listRef} role="menu" aria-label={label} className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg bg-surface-3 p-1 shadow-pop">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              title={it.disabled ? it.hint : undefined}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm focus:bg-hover focus:outline-none disabled:opacity-45 [&_svg]:size-4",
                it.tone === "danger" ? "text-negative hover:bg-negative-soft" : "text-fg-muted hover:bg-hover hover:text-fg",
              )}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
