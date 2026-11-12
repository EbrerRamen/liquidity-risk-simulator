import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type AlertTone = "info" | "positive" | "warning" | "negative";

const TONES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-accent-line bg-accent-soft text-accent-strong", icon: <Info /> },
  positive: { box: "border-positive-line bg-positive-soft text-positive", icon: <CheckCircle2 /> },
  warning: { box: "border-warning-line bg-warning-soft text-warning", icon: <AlertTriangle /> },
  negative: { box: "border-negative-line bg-negative-soft text-negative", icon: <XCircle /> },
};

/** Inline notice. Tone tints the frame and icon; body text stays readable in fg. */
export function Alert({
  tone = "info",
  title,
  icon,
  children,
  className,
  live = false,
}: {
  tone?: AlertTone;
  title: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Announce to screen readers when it appears (errors raised by an action). */
  live?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div
      role={live ? (tone === "negative" || tone === "warning" ? "alert" : "status") : undefined}
      className={cn("flex gap-2.5 rounded-md border px-3 py-2.5 text-sm", t.box, className)}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden>
        {icon ?? t.icon}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-xs text-fg-muted">{children}</div>}
      </div>
    </div>
  );
}


