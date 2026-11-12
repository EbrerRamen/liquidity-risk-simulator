import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { ChartCard } from "@/components/charts";
import { buttonClass, Table, Td, Th, THead, Tr } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Band } from "@/mocks/dashboard-data";
import { cardState, useRiskDistribution } from "../queries";

const BANDS: { band: Band; label: string; fill: string }[] = [
  { band: "LOW", label: "Low", fill: "bg-positive" },
  { band: "MEDIUM", label: "Medium", fill: "bg-caution" },
  { band: "HIGH", label: "High", fill: "bg-warning" },
  { band: "CRITICAL", label: "Critical", fill: "bg-negative" },
];

/** Tall segmented bar: one whole split into its bands, counts printed where they fit. */
function SegmentedBar({ counts, total, label }: { counts: Record<Band, number>; total: number; label: string }) {
  const summary = BANDS.map((b) => `${b.label} ${counts[b.band]}`).join(", ");
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="num text-fg-faint">{total} counterparties</span>
      </div>
      <div className="flex h-7 gap-0.5" role="img" aria-label={`${label}: ${summary}`}>
        {BANDS.map((b) => {
          const n = counts[b.band];
          if (n === 0) return null;
          const pct = (n / total) * 100;
          return (
            <div
              key={b.band}
              title={`${b.label}: ${n} (${pct.toFixed(0)}%)`}
              className={cn("flex items-center rounded-[4px] px-2", b.fill)}
              style={{ width: `${pct}%` }}
            >
              {pct >= 9 && <span className="num text-xs font-semibold text-fg-onaccent">{n}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RiskCard() {
  const q = useRiskDistribution();
  const d = q.data;
  return (
    <ChartCard
      title="Counterparty risk"
      subtitle="Latest model assessment vs analyst classification"
      height={276}
      grow
      {...cardState(q)}
      actions={
        <Link to="/intelligence/counterparty-risk" className={buttonClass("ghost", "sm", "text-fg-muted")}>
          Review <ArrowUpRight />
        </Link>
      }
      chart={() =>
        d && (
          <div className="flex h-full flex-col gap-4 px-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Legend">
              {BANDS.map((b) => (
                <li key={b.band} className="flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-[2px]", b.fill)} aria-hidden />
                  {b.label}
                </li>
              ))}
            </ul>
            <SegmentedBar label="Model" counts={d.model} total={d.total} />
            <SegmentedBar label="Analyst" counts={d.analyst} total={d.total} />
            <Link
              to="/intelligence/counterparty-risk?disagreement=true"
              className="flex items-center justify-between rounded-md border border-caution-line bg-caution-soft px-3 py-2 text-xs hover:bg-caution/15"
            >
              <span className="text-fg">
                <span className="num font-semibold">{d.disagreements}</span> counterparties where model and analyst disagree
              </span>
              <ArrowUpRight className="size-3.5 text-fg-muted" aria-hidden />
            </Link>
            <div>
              <div className="eyebrow mb-1.5">Open anomalies</div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                {d.anomalies.map((a) => (
                  <li key={a.type}>
                    <Link to={`/intelligence/anomalies?type=${a.type}&status=OPEN`} className="flex items-baseline justify-between gap-2 rounded-sm text-xs hover:text-fg">
                      <span className="truncate text-fg-muted">{a.label}</span>
                      <span className="num font-semibold text-fg">{a.open}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      }
      table={() => (
        <Table>
          <THead>
            <tr>
              <Th>Band</Th>
              <Th numeric>Model</Th>
              <Th numeric>Analyst</Th>
            </tr>
          </THead>
          <tbody>
            {BANDS.map((b) => (
              <Tr key={b.band}>
                <Td>{b.label}</Td>
                <Td numeric>{d?.model[b.band]}</Td>
                <Td numeric>{d?.analyst[b.band]}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    />
  );
}
