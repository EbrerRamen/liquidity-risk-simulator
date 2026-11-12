import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-fg-onaccent hover:bg-accent-strong font-semibold",
  secondary: "bg-surface-2 text-fg border border-line-strong hover:bg-hover",
  ghost: "text-fg-muted hover:text-fg hover:bg-hover",
  danger: "bg-negative-soft text-negative border border-negative-line hover:bg-negative/20",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 gap-1.5 text-xs",
  md: "h-8 px-3 gap-2 text-sm",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors " +
  "disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0";

/** Button styling for elements that must stay links (e.g. react-router <Link>). */
export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // required: icon-only buttons need an accessible name
  size?: Size;
}

export function IconButton({ label, size = "md", className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors",
        "hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4",
        size === "sm" ? "size-7" : "size-8",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
