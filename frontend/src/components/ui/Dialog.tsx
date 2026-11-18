import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { Button } from "./Button";

/** Centred modal for short decisions. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  tone = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  footer: ReactNode;
  tone?: "default" | "danger";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useFocusTrap(ref, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // a drawer underneath must not also close
        onClose();
      }
    };
    // Capture phase so this runs before the drawer's listener.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-lg bg-surface-2 p-5 shadow-pop outline-none"
      >
        <div className="flex gap-3">
          {tone === "danger" && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-negative-line bg-negative-soft text-negative">
              <AlertTriangle className="size-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {children && (
              <div id={bodyId} className="mt-1.5 text-sm text-fg-muted">
                {children}
              </div>
            )}
          </div>
        </div>
        <div className={cn("mt-5 flex justify-end gap-2")}>{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Yes/no confirmation. Cancel is focused first, so Enter never destroys by accident. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = "default",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      tone={tone}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body}
    </Dialog>
  );
}
