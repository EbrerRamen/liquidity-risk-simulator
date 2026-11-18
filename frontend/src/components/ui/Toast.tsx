import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "positive" | "negative" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface ToastApi {
  show: (t: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON: Record<ToastTone, ReactNode> = {
  positive: <CheckCircle2 className="size-4 text-positive" aria-hidden />,
  negative: <XCircle className="size-4 text-negative" aria-hidden />,
  info: <Info className="size-4 text-accent" aria-hidden />,
};

/** Short confirmations after an action. Announced politely; errors stay longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "negative" ? 8000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {items.map((t) => (
            <div
              key={t.id}
              role={t.tone === "negative" ? "alert" : "status"}
              className={cn("pointer-events-auto flex gap-2.5 rounded-lg bg-surface-3 px-3 py-2.5 shadow-pop")}
            >
              <span className="mt-0.5 shrink-0">{ICON[t.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{t.title}</p>
                {t.detail && <p className="mt-0.5 text-xs text-fg-muted">{t.detail}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-faint hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
