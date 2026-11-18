import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

function isTyping(el: Element | null): boolean {
  return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);
}

/** Debounced search box. "/" focuses it from anywhere on the page; Esc clears. */
export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft.trim()), 300);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTyping(document.activeElement) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && draft) {
            e.stopPropagation();
            setDraft("");
            onChange("");
          }
          if (e.key === "Enter") onChange(draft.trim());
        }}
        className="h-8 w-full rounded-md border border-line-strong bg-surface-2 pr-8 pl-8 text-sm text-fg placeholder:text-fg-faint hover:border-fg-faint focus:border-accent focus:ring-2 focus:ring-accent-soft focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            onChange("");
            ref.current?.focus();
          }}
          className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-fg-faint hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-sm border border-line-strong px-1 font-mono text-2xs text-fg-faint" aria-hidden>
          /
        </kbd>
      )}
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

/** Multi-select filter in a popover: a button showing the selection, checkboxes inside. */
export function MultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [needle, setNeedle] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listId = `filter-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const searchable = options.length > 12;
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle.toLowerCase())) : options;

  useEffect(() => {
    if (!open) return setNeedle("");
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const summary =
    selected.length === 0 ? null : selected.length === 1 ? options.find((o) => o.value === selected[0])?.label : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm whitespace-nowrap transition-colors",
          selected.length ? "border-accent-line bg-accent-soft text-fg" : "border-line-strong bg-surface-2 text-fg-muted hover:text-fg",
        )}
      >
        {label}
        {summary && <span className="max-w-32 truncate font-medium text-accent-strong">: {summary}</span>}
        <ChevronDown className="size-3.5 text-fg-faint" aria-hidden />
      </button>
      {open && (
        <div id={listId} className={cn("absolute top-full left-0 z-30 mt-1 rounded-lg bg-surface-3 p-1 shadow-pop", searchable ? "w-72" : "w-60")}>
          {searchable && (
            <input
              type="search"
              value={needle}
              onChange={(e) => setNeedle(e.target.value)}
              placeholder={`Find ${label.toLowerCase()}`}
              aria-label={`Find ${label.toLowerCase()}`}
              className="mb-1 h-7 w-full rounded-md border border-line-strong bg-surface-2 px-2 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
            />
          )}
          <fieldset>
            <legend className="sr-only">{label}</legend>
            <div className="max-h-72 overflow-y-auto">
              {shown.length === 0 && <p className="px-2.5 py-2 text-xs text-fg-faint">No matches</p>}
              {shown.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <label key={o.value} className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-fg-muted hover:bg-hover hover:text-fg">
                    <input type="checkbox" checked={on} onChange={() => toggle(o.value)} className="peer sr-only" />
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[3px] border peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                        on ? "border-accent bg-accent text-fg-onaccent" : "border-line-strong",
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.count !== undefined && <span className="num text-2xs text-fg-faint">{o.count}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 h-7 w-full rounded-md border-t border-line-strong text-xs text-fg-muted hover:text-fg">
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface DateRangePreset {
  label: string;
  from: string | null;
  to: string | null;
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
export const formatRangeLabel = (from?: string, to?: string) => {
  const f = (d: string) => DATE_FMT.format(new Date(d + "T00:00:00Z"));
  if (from && to) return from === to ? f(from) : `${f(from)} – ${f(to)}`;
  if (from) return `from ${f(from)}`;
  if (to) return `until ${f(to)}`;
  return "";
};

/** Date range in a popover: quick presets (relative to the business date) or exact dates. */
export function DateRangeFilter({
  label,
  from,
  to,
  presets,
  onChange,
}: {
  label: string;
  from?: string;
  to?: string;
  presets: DateRangePreset[];
  onChange: (from: string | null, to: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: from ?? "", to: to ?? "" });
  const ref = useRef<HTMLDivElement>(null);
  const active = !!(from || to);

  useEffect(() => {
    if (!open) return;
    setDraft({ from: from ?? "", to: to ?? "" });
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, from, to]);

  const invalid = !!(draft.from && draft.to && draft.from > draft.to);
  const apply = (f: string | null, t: string | null) => {
    onChange(f || null, t || null);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm whitespace-nowrap transition-colors",
          active ? "border-accent-line bg-accent-soft text-fg" : "border-line-strong bg-surface-2 text-fg-muted hover:text-fg",
        )}
      >
        {label}
        {active && <span className="max-w-44 truncate font-medium text-accent-strong">: {formatRangeLabel(from, to)}</span>}
        <ChevronDown className="size-3.5 text-fg-faint" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label={`${label} range`} className="absolute top-full left-0 z-30 mt-1 w-72 rounded-lg bg-surface-3 p-1 shadow-pop">
          <ul className="flex flex-col">
            {presets.map((p) => {
              const on = (p.from ?? "") === (from ?? "") && (p.to ?? "") === (to ?? "") && active;
              return (
                <li key={p.label}>
                  <button
                    type="button"
                    onClick={() => apply(p.from, p.to)}
                    className="flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-sm text-fg-muted hover:bg-hover hover:text-fg"
                  >
                    {p.label}
                    {on && <Check className="size-4 text-accent" strokeWidth={3} aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-line-strong px-2.5 pt-2 pb-1.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-2xs text-fg-faint">
                From
                <input type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="h-7 rounded-md border border-line-strong bg-surface-2 px-1.5 text-xs text-fg focus:border-accent focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-2xs text-fg-faint">
                To
                <input type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="h-7 rounded-md border border-line-strong bg-surface-2 px-1.5 text-xs text-fg focus:border-accent focus:outline-none" />
              </label>
            </div>
            {invalid && <p className="mt-1.5 text-2xs text-negative">"From" must be on or before "To".</p>}
            <div className="mt-2 flex justify-between gap-2">
              <button type="button" onClick={() => apply(null, null)} className="text-xs text-fg-muted hover:text-fg">
                Clear
              </button>
              <button
                type="button"
                disabled={invalid || (!draft.from && !draft.to)}
                onClick={() => apply(draft.from, draft.to)}
                className="h-7 rounded-md bg-accent px-2.5 text-xs font-semibold text-fg-onaccent hover:bg-accent-strong disabled:opacity-45"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

/** One removable chip per active filter, plus "Clear all". */
export function ActiveFilters({ filters, onClearAll }: { filters: ActiveFilter[]; onClearAll: () => void }) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {filters.map((f) => (
        <span key={f.key} className="inline-flex h-6 items-center gap-1 rounded-full border border-line-strong bg-surface-2 pr-1 pl-2.5 text-xs text-fg-muted">
          {f.label}
          <button type="button" onClick={f.onRemove} aria-label={`Remove filter ${f.label}`} className="flex size-4 items-center justify-center rounded-full hover:bg-hover hover:text-fg">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="ml-1 text-xs font-medium text-accent hover:text-accent-strong">
        Clear all
      </button>
    </div>
  );
}
