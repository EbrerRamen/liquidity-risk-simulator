import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** On/off toggle (role="switch"). Pair with a visible label via aria-labelledby or Field. */
export function Switch({ checked, onChange, className, disabled, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-accent bg-accent" : "border-line-strong bg-surface-3",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-3.5 rounded-full shadow transition-transform",
          checked ? "translate-x-[18px] bg-fg-onaccent" : "translate-x-[2px] bg-fg-muted",
        )}
      />
    </button>
  );
}
