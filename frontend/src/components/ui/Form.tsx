import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const CONTROL =
  "h-8 w-full rounded-md border border-line-strong bg-surface-2 px-2.5 text-sm text-fg placeholder:text-fg-faint " +
  "transition-colors hover:border-fg-faint focus:border-accent focus:outline-none focus-visible:outline-none " +
  "focus:ring-2 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-negative aria-[invalid=true]:ring-negative-soft";

/**
 * Label, hint and error around one control. The render prop wires up id,
 * aria-describedby and aria-invalid so every field is accessible by default.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-fg-muted">
        {label}
        {required && <span className="ml-0.5 text-negative" aria-hidden>*</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-negative">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-fg-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Fixed text inside the control, e.g. a currency code or "%". */
  suffix?: string;
  numeric?: boolean;
}

export function Input({ className, suffix, numeric, ...rest }: InputProps) {
  const input = (
    <input
      className={cn(CONTROL, numeric && "num text-right", suffix && "pr-11", className)}
      inputMode={numeric ? "decimal" : undefined}
      {...rest}
    />
  );
  if (!suffix) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-fg-faint">
        {suffix}
      </span>
    </div>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(CONTROL, "appearance-none pr-8", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-faint" />
    </div>
  );
}

/** Single choice from a short set: horizons (1/7/14/30/90d), granularity, basis. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "num rounded-sm px-2.5 font-medium transition-colors",
              size === "sm" ? "h-6 text-xs" : "h-7 text-sm",
              active ? "bg-surface-3 text-fg shadow-[0_0_0_1px_var(--color-line-strong)]" : "text-fg-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: ReadonlyArray<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-4 border-b border-line">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "-mb-px flex h-9 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors",
              active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="num rounded-sm bg-surface-3 px-1.5 text-2xs text-fg-muted">{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
