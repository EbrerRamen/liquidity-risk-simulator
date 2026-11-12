import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy, Inbox, RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export { Skeleton } from "./Skeleton";

/** Empty state: say what is missing and offer the next action (TECHNICAL_PLAN §1.5). */
export function EmptyState({
  icon = <Inbox />,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-faint [&_svg]:size-5">
        {icon}
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error state: the message, a retry, and the request ID so a user can quote it. */
export function ErrorState({
  title = "Couldn't load this data",
  message,
  requestId,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!requestId) return;
    void navigator.clipboard?.writeText(requestId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-negative-line bg-negative-soft text-negative [&_svg]:size-5">
        <AlertTriangle />
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-fg-muted">{message}</p>
      {requestId && (
        <button
          type="button"
          onClick={copy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-sm px-1 font-mono text-2xs text-fg-faint hover:text-fg-muted"
          title="Copy request ID"
        >
          Request ID {requestId}
          {copied ? <Check className="size-3 text-positive" /> : <Copy className="size-3" />}
        </button>
      )}
      {onRetry && (
        <Button size="sm" className="mt-4" icon={<RotateCw />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
