import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { Badge, Money, Skeleton, Stat } from "@/components/ui";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/dates";
import { formatCompact, formatDate, formatDateShort, formatMultiple } from "@/lib/format";
import type { DashboardFilters, KpiResponse } from "@/mocks/dashboard";

function pctChange(now: string, prev: string): { text: string; direction: "up" | "down"; good: boolean } {
  const n = Number(now);
  const p = Number(prev);
  const ch = ((n - p) / Math.abs(p)) * 100;
  const sign = ch >= 0 ? "+" : "−";
  return { text: `${sign}${Math.abs(ch).toFixed(1)}%`, direction: ch >= 0 ? "up" : "down", good: ch >= 0 };
}

export function KpiTiles({ data, filters, loading }: { data?: KpiResponse; filters: DashboardFilters; loading: boolean }) {
  const h = filters.horizon;
  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Stat key={i} label=" " value="" loading />
        ))}
      </div>
    );
  }
  const ccy = data.currency;
  const slci = data.slci_30d ? Number(data.slci_30d) : null;
  const slciPrev = data.slci_30d_previous ? Number(data.slci_30d_previous) : null;
  const s = data.survival;

  return (
    <div className={cn("grid gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-4", loading && "opacity-50")}>
      <Stat
        label="Available liquidity"
        value={<Money value={data.available_liquidity} currency={ccy} compact tabular={false} />}
        delta={pctChange(data.available_liquidity, data.available_liquidity_previous)}
        caption="vs. previous business day"
        info={
          <>
            Opening liquidity at end of {formatDate(data.as_of)}: cash {formatCompact(data.opening_breakdown.cash)} plus
            haircut-adjusted unencumbered securities {formatCompact(data.opening_breakdown.securities)} {ccy}. Committed
            facilities excluded.
          </>
        }
      />
      <Stat
        label={`Net cash flow · ${h}d`}
        value={<Money value={data.net_cash_flow} currency={ccy} compact sign="always" tabular={false} />}
        caption={
          <>
            In {formatCompact(data.expected_inflows)} · Out {formatCompact(data.expected_outflows)}
          </>
        }
        info="Projected contractual inflows minus outflows over the horizon. Overdue inflows are excluded; overdue outflows fall on day 1."
      />
      <Stat
        label="SLCI · 30d"
        value={slci === null ? "n/a" : formatMultiple(data.slci_30d!)}
        delta={
          slci !== null && slciPrev !== null
            ? {
                text: `${slci - slciPrev >= 0 ? "+" : "−"}${Math.abs(slci - slciPrev).toFixed(2)}`,
                direction: slci >= slciPrev ? "up" : "down",
                good: slci >= slciPrev,
              }
            : undefined
        }
        caption="Simulated · not the LCR"
        flag={slci !== null && slci < 1 ? <Badge tone="negative" dot>Below 1.0×</Badge> : undefined}
        info="Simulated Liquidity Coverage Indicator: opening liquidity over 30-day net outflows, with inflows capped at 75% of outflows. Fixed 30-day window whatever the horizon. Non-regulatory."
      />
      {s ? (
        <Stat
          label="Survival horizon"
          value={
            s.survival_days === null ? (
              <span>
                &gt; {h} <span className="text-base font-medium text-fg-muted">days</span>
              </span>
            ) : (
              <span>
                {s.survival_days} <span className="text-base font-medium text-fg-muted">days</span>
              </span>
            )
          }
          caption={
            s.first_breach_date ? (
              <>Funding requirement {formatCompact(s.funding_requirement)} {ccy}</>
            ) : (
              <>Lowest {formatCompact(s.min_available_liquidity)} on {formatDateShort(s.min_date)}</>
            )
          }
          flag={
            s.first_breach_date ? (
              <Badge tone="warning" dot>Breach {formatDateShort(s.first_breach_date)}</Badge>
            ) : (
              <Badge tone="positive" dot>No breach</Badge>
            )
          }
          info={`Days until available liquidity first falls below the minimum buffer (${formatCompact(s.min_buffer)} ${ccy}). Funding requirement is the shortfall at the lowest point.`}
        />
      ) : (
        <Stat
          label="Survival horizon"
          value={<span className="text-fg-faint">—</span>}
          caption="Buffer is set on the consolidated position"
          info="The minimum buffer applies to all currencies together. Select All currencies to see survival and the funding requirement."
        />
      )}
    </div>
  );
}

function StripItem({ label, to, children, sub }: { label: string; to: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <Link to={to} className="group flex min-w-0 flex-col gap-0.5 px-4 py-3 hover:bg-surface-2 focus-visible:-outline-offset-2">
      <span className="flex items-center gap-1 text-xs text-fg-muted">
        {label}
        <ChevronRight className="size-3 text-fg-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
      <span className="truncate text-base font-semibold text-fg">{children}</span>
      {sub && <span className="truncate text-xs text-fg-faint">{sub}</span>}
    </Link>
  );
}

/** Secondary metrics, each a drill-down into the list behind it. */
export function KpiStrip({ data, filters, loading, asOf }: { data?: KpiResponse; filters: DashboardFilters; loading: boolean; asOf: string }) {
  if (!data) return <Skeleton className="h-[74px] w-full rounded-lg" />;
  const ccy = data.currency;
  const ccyParam = filters.currency === "ALL" ? "" : `&currency=${filters.currency}`;
  const from = addDays(asOf, 1);
  const to = addDays(asOf, data.horizon_days);
  return (
    <div
      className={cn(
        "grid divide-line overflow-hidden rounded-lg border border-line bg-surface-1 transition-opacity",
        "grid-cols-2 divide-x divide-y md:grid-cols-5 md:divide-y-0",
        loading && "opacity-50",
      )}
    >
      <StripItem label={`Maturities · ${data.horizon_days}d`} to={`/data/deals?maturity_from=${from}&maturity_to=${to}${ccyParam}`} sub={`${formatCompact(data.maturities.borrow)} repay · ${formatCompact(data.maturities.lend)} receive`}>
        <span className="num">{data.maturities.count}</span> <span className="text-sm font-normal text-fg-muted">deals</span>
      </StripItem>
      <StripItem label="Expected inflows" to={`/data/cash-flows?direction=IN&status=PROJECTED&expected_from=${from}&expected_to=${to}${ccyParam}`} sub={`Next ${data.horizon_days} days`}>
        <Money value={data.expected_inflows} currency={ccy} compact tabular={false} />
      </StripItem>
      <StripItem label="Expected outflows" to={`/data/cash-flows?direction=OUT&status=PROJECTED&expected_from=${from}&expected_to=${to}${ccyParam}`} sub={`Next ${data.horizon_days} days`}>
        <Money value={data.expected_outflows} currency={ccy} compact tabular={false} />
      </StripItem>
      <StripItem label="High-risk counterparties" to="/intelligence/counterparty-risk?band=HIGH,CRITICAL" sub={`${data.high_risk_counterparties.disagreements} disagree with analyst`}>
        <span className="num">{data.high_risk_counterparties.count}</span> <span className="text-sm font-normal text-fg-muted">of 48</span>
      </StripItem>
      <StripItem label="Active scenarios" to="/stress/scenarios" sub="Presets and saved">
        <span className="num">{data.active_scenarios}</span>
      </StripItem>
    </div>
  );
}
