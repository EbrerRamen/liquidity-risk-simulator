import { Link } from "react-router";
import { AlertTriangle, ArrowRight, CircleAlert, Info } from "lucide-react";
import { Card, ErrorState, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DashboardFilters, Finding } from "@/mocks/dashboard";
import { useFindings } from "./queries";

const SEVERITY: Record<Finding["severity"], { icon: typeof Info; cls: string; label: string }> = {
  critical: { icon: CircleAlert, cls: "text-negative", label: "Critical" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "Warning" },
  info: { icon: Info, cls: "text-accent", label: "Note" },
};

/** Rule-based findings over the same figures the tiles and charts show. */
export function FindingsCard({ filters }: { filters: DashboardFilters }) {
  const q = useFindings(filters);
  return (
    <Card title="Needs attention" subtitle="Rule-based checks on today's position" flush className="flex flex-col">
      {q.status === "pending" ? (
        <div className="flex flex-col gap-4 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-4 shrink-0" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : q.status === "error" ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : (
        <ul className={cn("divide-y divide-line transition-opacity", q.isPlaceholderData && "opacity-50")}>
          {q.data.map((f) => {
            const s = SEVERITY[f.severity];
            const Icon = s.icon;
            return (
              <li key={f.id} className="flex gap-3 px-4 py-3">
                <Icon className={cn("mt-0.5 size-4 shrink-0", s.cls)} aria-label={s.label} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{f.title}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{f.detail}</p>
                  <Link to={f.link.to} className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-accent hover:text-accent-strong">
                    {f.link.label}
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
