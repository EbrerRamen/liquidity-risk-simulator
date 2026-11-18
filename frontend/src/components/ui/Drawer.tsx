import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { IconButton } from "./Button";

/**
 * Right-hand panel for record details and forms. Esc, the overlay and the
 * close button all call `onClose`, so a dirty form can ask before discarding.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  footer,
  width = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Let an open dialog or menu inside handle its own Escape first.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col border-l border-line-strong bg-surface-1 shadow-pop outline-none",
          width === "md" ? "max-w-[480px]" : "max-w-[640px]",
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-base font-semibold text-fg">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-xs text-fg-muted">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <IconButton label="Close panel" onClick={onClose}>
              <X />
            </IconButton>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
