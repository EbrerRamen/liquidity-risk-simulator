import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { Badge, buttonClass, Card, EmptyState, ErrorState, Money, RiskBadge, Skeleton, Table, Td, Th, THead, Tr } from "@/components/ui";
import { cn } from "@/lib/cn";
import { addDays, daysBetween } from "@/lib/dates";
import { formatDate, formatPercent } from "@/lib/format";
import type { DashboardFilters } from "@/mocks/dashboard";
import { useUpcomingMaturities } from "./queries";

export function MaturitiesTable({ filters, asOf }: { filters: DashboardFilters; asOf: string }) {
  const q = useUpcomingMaturities(filters);
  const params = new URLSearchParams({ maturity_from: addDays(asOf, 1), maturity_to: addDays(asOf, filters.horizon) });
  if (filters.currency !== "ALL") params.set("currency", filters.currency);

  return (
    <Card
      title="Upcoming maturities"
      subtitle={q.data ? `${q.data.total} deals mature in the next ${filters.horizon} days` : `Next ${filters.horizon} days`}
      flush
      actions={
        <Link to={`/data/deals?${params}`} className={buttonClass("ghost", "sm", "text-fg-muted")}>
          View all <ArrowUpRight />
        </Link>
      }
    >
      {q.status === "pending" ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : q.status === "error" ? (
        <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title="No maturities in this window" description="Try a longer horizon or another currency." />
      ) : (
        <div className={cn("transition-opacity", q.isPlaceholderData && "opacity-50")}>
          <Table>
            <THead>
              <tr>
                <Th>Maturity</Th>
                <Th>Reference</Th>
                <Th>Counterparty</Th>
                <Th>Direction</Th>
                <Th numeric>Principal</Th>
                <Th numeric>Rate</Th>
                <Th>Model risk</Th>
              </tr>
            </THead>
            <tbody>
              {q.data.items.map((m) => {
                const inDays = daysBetween(asOf, m.maturity_date);
                return (
                  <Tr key={m.reference}>
                    <Td>
                      <span className="num">{formatDate(m.maturity_date)}</span>
                      <span className="ml-2 text-xs text-fg-faint">{inDays === 1 ? "tomorrow" : `in ${inDays}d`}</span>
                    </Td>
                    <Td mono>
                      <Link to={`/data/deals?q=${m.reference}`} className="text-accent-strong hover:underline">
                        {m.reference}
                      </Link>
                    </Td>
                    <Td className="max-w-52 truncate" title={`${m.counterparty} · ${m.deal_type}`}>
                      {m.counterparty}
                    </Td>
                    <Td>
                      <Badge>{m.direction}</Badge>
                    </Td>
                    <Td numeric>
                      <Money value={m.principal} currency={m.currency} />
                    </Td>
                    <Td numeric className={m.rate.startsWith("-") ? "text-negative" : undefined}>
                      {formatPercent(m.rate)}
                    </Td>
                    <Td>
                      <RiskBadge band={m.counterparty_band} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}
