import { Link } from "react-router";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { FileText, FlaskConical, RefreshCw } from "lucide-react";
import { useSession } from "@/app/session";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonClass, IconButton, SegmentedControl, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatWeekday } from "@/lib/format";
import type { CurrencyFilter, Horizon, Lookback } from "@/mocks/dashboard";
import { CURRENCIES } from "@/mocks/dashboard-data";
import { CashHistoryChart } from "./charts/CashHistoryChart";
import { ConcentrationCard, CurrencyCard } from "./charts/BreakdownCards";
import { FlowsChart } from "./charts/FlowsChart";
import { MaturityChart } from "./charts/MaturityChart";
import { ProjectionChart } from "./charts/ProjectionChart";
import { RiskCard } from "./charts/RiskCard";
import { HORIZONS, LOOKBACKS, useDashboardFilters } from "./filters";
import { FindingsCard } from "./FindingsCard";
import { KpiStrip, KpiTiles } from "./KpiSection";
import { MaturitiesTable } from "./MaturitiesTable";
import { useKpis } from "./queries";

function FilterRow() {
  const { system } = useSession();
  const [filters, setFilters] = useDashboardFilters();
  const client = useQueryClient();
  const fetching = useIsFetching({ queryKey: ["dashboard"] }) > 0;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-line bg-surface-1 px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-fg-faint">Horizon</span>
        <SegmentedControl
          label="Projection horizon"
          size="sm"
          options={HORIZONS}
          value={String(filters.horizon) as `${Horizon}`}
          onChange={(v) => setFilters({ horizon: Number(v) as Horizon })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-fg-faint">History</span>
        <SegmentedControl
          label="History look-back"
          size="sm"
          options={LOOKBACKS}
          value={String(filters.lookback) as `${Lookback}`}
          onChange={(v) => setFilters({ lookback: Number(v) as Lookback })}
        />
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-2xs font-medium text-fg-faint">Currency</span>
        <Select
          value={filters.currency}
          onChange={(e) => setFilters({ currency: e.target.value as CurrencyFilter })}
          className="h-7 w-48 text-xs"
        >
          <option value="ALL">All currencies ({system.baseCurrency} equiv.)</option>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c} only
            </option>
          ))}
        </Select>
      </label>
      <div className="ml-auto flex items-center gap-2 self-center text-xs text-fg-faint">
        <span className="hidden md:inline">
          As of {formatWeekday(system.businessDate)} {formatDate(system.businessDate)} close
        </span>
        <IconButton
          label="Refresh dashboard"
          size="sm"
          onClick={() => void client.invalidateQueries({ queryKey: ["dashboard"] })}
        >
          <RefreshCw className={cn(fetching && "animate-spin")} />
        </IconButton>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { system, can } = useSession();
  const [filters, setFilters] = useDashboardFilters();
  const kpis = useKpis(filters);
  const asOf = system.businessDate;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today's liquidity, what is coming due, and where the risk sits."
        actions={
          <>
            <Link to="/reports" className={buttonClass("secondary", "md")}>
              <FileText /> Report
            </Link>
            {can("RISK_ANALYST") && (
              <Link to="/stress/scenarios" className={buttonClass("primary", "md")}>
                <FlaskConical /> Run stress test
              </Link>
            )}
          </>
        }
      />

      <FilterRow />

      <div className="flex flex-col gap-4">
        <KpiTiles data={kpis.data} filters={filters} loading={kpis.isPlaceholderData} />
        <KpiStrip data={kpis.data} filters={filters} loading={kpis.isPlaceholderData} asOf={asOf} />

        <div className="grid gap-4 xl:grid-cols-3">
          <ProjectionChart filters={filters} asOf={asOf} className="xl:col-span-2" />
          <FindingsCard filters={filters} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <FlowsChart filters={filters} />
          <CashHistoryChart filters={filters} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <MaturityChart filters={filters} asOf={asOf} />
          <ConcentrationCard />
          <CurrencyCard currency={filters.currency} onPick={(c) => setFilters({ currency: c })} />
          <RiskCard />
        </div>

        <MaturitiesTable filters={filters} asOf={asOf} />
      </div>
    </>
  );
}
