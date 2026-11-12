import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Lightweight hover/focus tooltip. The trigger is focusable so keyboard users
 * can reach it, and the content is linked with aria-describedby.
 */
export function Tooltip({
  content,
  side = "top",
  align = "center",
  className,
  children,
}: {
  content: ReactNode;
  side?: "top" | "bottom";
  /** Which edge of the trigger the tooltip lines up with. Use "end" near the right edge of the screen. */
  align?: "start" | "center" | "end";
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      <span tabIndex={0} aria-describedby={id} className="inline-flex rounded-sm outline-offset-1">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute z-50 w-max max-w-72 rounded-md bg-surface-3 px-2 py-1.5",
          "text-xs font-normal text-fg shadow-pop",
          // display:none while hidden, so an off-screen tooltip never widens the page
          "hidden group-hover/tip:block group-focus-within/tip:block",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {content}
      </span>
    </span>
  );
}
