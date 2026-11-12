import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, C, ChartCard, ChartTooltipBox, MARK, niceScale, tickDate, tickMoney } from "@/components/charts";
import { Money, Table, Td, Th, THead, Tr } from "@/components/ui";
import { formatCompact, formatDate, formatWeekday, MINUS } from "@/lib/format";
import { toDecimal } from "@/lib/numbers";
import type { DashboardFilters } from "@/mocks/dashboard";
import { cardState, useCashHistory } from "../queries";

export function CashHistoryChart({ filters }: { filters: DashboardFilters }) {
  const q = useCashHistory(filters);
  const d = q.data;
  const ccy = d?.currency ?? "USD";
  const points = (d?.series ?? []).map((p) => ({ date: p.date, cash: Number(p.cash) }));
  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last ? last.cash - first.cash : 0;
  const lo = Math.min(...points.map((p) => p.cash));
  const hi = Math.max(...points.map((p) => p.cash));
  const y = niceScale(Math.max(0, lo - (hi - lo) * 0.1), hi + (hi - lo) * 0.1, 5);

  return (
    <ChartCard
      title="Cash position"
      subtitle={`${ccy} · actual, from settled flows · last ${filters.lookback} days`}
      height={240}
      {...cardState(q)}
      footer={
        first && last ? (
          <>
            {change >= 0 ? "Up" : "Down"}{" "}
            <span className="num text-fg-muted">
              {change < 0 ? MINUS : "+"}
              {formatCompact(toDecimal(Math.abs(change)))} {ccy}
            </span>{" "}
            over {filters.lookback} days. Cash only: securities are revalued daily and not tracked historically.
          </>
        ) : undefined
      }
      chart={() => (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 16, right: 40, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="date" tickFormatter={tickDate} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: C.axis }} minTickGap={32} tickMargin={8} />
            <YAxis
              tickFormatter={tickMoney}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={y.domain}
              ticks={y.ticks}
            />
            <Tooltip
              cursor={{ stroke: C.axis, strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as { date: string; cash: number } | undefined) : undefined;
                if (!p) return null;
                return (
                  <ChartTooltipBox
                    title={`${formatWeekday(p.date)} ${formatDate(p.date)}`}
                    rows={[{ key: "cash", label: "Cash", value: <Money value={toDecimal(p.cash)} currency={ccy} compact colored={false} />, color: C.accent }]}
                  />
                );
              }}
            />
            <Area type="linear" dataKey="cash" stroke="none" fill={C.accent} fillOpacity={0.08} isAnimationActive={false} baseValue="dataMin" />
            <Line
              type="linear"
              dataKey="cash"
              stroke={C.accent}
              strokeWidth={MARK.line}
              dot={false}
              activeDot={{ r: MARK.dot, fill: C.accent, stroke: C.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {last && (
              <ReferenceDot
                x={last.date}
                y={last.cash}
                r={MARK.dot}
                fill={C.accent}
                stroke={C.surface}
                strokeWidth={2}
                label={{ value: formatCompact(toDecimal(last.cash)), position: "right", fill: C.muted, fontSize: 11, offset: 8 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
      table={() => (
        <Table>
          <THead>
            <tr>
              <Th>Date</Th>
              <Th numeric>Cash ({ccy})</Th>
            </tr>
          </THead>
          <tbody>
            {[...points].reverse().map((p) => (
              <Tr key={p.date}>
                <Td className="num">{formatDate(p.date)}</Td>
                <Td numeric>
                  <Money value={toDecimal(p.cash)} currency={ccy} hideCurrency />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    />
  );
}
