import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "positive" | "negative" | "warning" | "caution";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg-muted border-line-strong",
  accent: "bg-accent-soft text-accent-strong border-accent-line",
  positive: "bg-positive-soft text-positive border-positive-line",
  negative: "bg-negative-soft text-negative border-negative-line",
  warning: "bg-warning-soft text-warning border-warning-line",
  caution: "bg-caution-soft text-caution border-caution-line",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-fg-faint",
  accent: "bg-accent",
  positive: "bg-positive",
  negative: "bg-negative",
  warning: "bg-warning",
  caution: "bg-caution",
};

export interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", dot, icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-sm border px-1.5 text-2xs font-semibold whitespace-nowrap [&_svg]:size-3",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

/* Risk bands: always a text label plus a 4-step level meter, so colour is never the only cue. */

export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const BAND: Record<RiskBand, { tone: Tone; level: number; label: string }> = {
  LOW: { tone: "positive", level: 1, label: "Low" },
  MEDIUM: { tone: "caution", level: 2, label: "Medium" },
  HIGH: { tone: "warning", level: 3, label: "High" },
  CRITICAL: { tone: "negative", level: 4, label: "Critical" },
};

export function RiskBadge({ band, className }: { band: RiskBand; className?: string }) {
  const { tone, level, label } = BAND[band];
  return (
    <Badge tone={tone} className={className}>
      <span className="flex items-end gap-px" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn("w-[3px] rounded-[1px]", i <= level ? "bg-current" : "bg-current opacity-25")}
            style={{ height: 3 + i * 2 }}
          />
        ))}
      </span>
      {label}
    </Badge>
  );
}
