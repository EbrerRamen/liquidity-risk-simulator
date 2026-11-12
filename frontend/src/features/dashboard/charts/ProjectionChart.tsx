import { Link } from "react-router";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { AXIS_TICK, C, ChartCard, ChartTooltipBox, Legend, MARK, niceScale, tickDate, tickMoney } from "@/components/charts";
import { buttonClass, Money, Table, Td, Th, THead, Tr } from "@/components/ui";
import { daysBetween } from "@/lib/dates";
import { toDecimal } from "@/lib/numbers";
import { formatCompact, formatDate, formatDateShort, formatWeekday } from "@/lib/format";
import type { DashboardFilters, ProjectionResponse } from "@/mocks/dashboard";
import { cardState, useProjection } from "../queries";

interface Point {
  date: string;
  day: number;
  al: number;
  inflows: number | null;
  outflows: number | null;
  net: number | null;
}

function toPoints(d: ProjectionResponse, asOf: string): Point[] {
  // Start at T0 with the opening position so the line begins where today ends.
  const first: Point = { date: asOf, day: 0, al: Number(d.opening_liquidity), inflows: null, outflows: null, net: null };
  return [
    first,
    ...d.series.map((p) => ({
      date: p.date,
      day: daysBetween(asOf, p.date),
      al: Number(p.available_liquidity),
      inflows: Number(p.inflows),
      outflows: Number(p.outflows),
      net: Number(p.net),
    })),
  ];
}

export function ProjectionChart({ filters, asOf, className }: { filters: DashboardFilters; asOf: string; className?: string }) {
  const q = useProjection(filters);
  const d = q.data;
  const ccy = d?.currency ?? "USD";
  const points = d ? toPoints(d, asOf) : [];
  const buffer = d?.min_buffer ? Number(d.min_buffer) : null;
  const breach = d?.first_breach_date ? points.find((p) => p.date === d.first_breach_date) : undefined;
  const min = d ? points.find((p) => p.date === d.min.date) : undefined;
  const y = niceScale(0, Math.max(...points.map((p) => p.al), buffer ?? 0) * 1.04);

  return (
    <ChartCard
      className={className}
      grow
      title="Projected available liquidity"
      subtitle={`${ccy} · contractual flows, no rollover · next ${filters.horizon} days from ${formatDateShort(asOf)}`}
      height={300}
      {...cardState(q)}
      actions={
        <Link to={`/liquidity/position?horizon=${filters.horizon}`} className={buttonClass("ghost", "sm", "text-fg-muted")}>
          Analyse <ArrowUpRight />
        </Link>
      }
      legend={
        <Legend
          items={[
            { label: "Available liquidity (projected)", color: C.accent, shape: "dash" },
            ...(buffer !== null ? [{ label: "Minimum buffer", color: C.warning, shape: "dash" as const }] : []),
          ]}
        />
      }
      footer={
        d && buffer === null ? (
          "The minimum buffer is set on the consolidated position, so no breach is shown for a single currency."
        ) : d && breach && min ? (
          <>
            First breach <span className="text-fg-muted">{formatDate(breach.date)}</span> (day {breach.day}) · lowest{" "}
            <span className="num text-fg-muted">{formatCompact(toDecimal(min.al))} {ccy}</span> on {formatDateShort(min.date)}
          </>
        ) : d && min ? (
          <>
            No breach in {filters.horizon} days · lowest <span className="num text-fg-muted">{formatCompact(toDecimal(min.al))} {ccy}</span> on{" "}
            {formatDateShort(min.date)}
          </>
        ) : undefined
      }
      chart={() => (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 16, right: 16, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="al-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.accent} stopOpacity={0.14} />
                <stop offset="100%" stopColor={C.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis
              dataKey="date"
              tickFormatter={tickDate}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: C.axis }}
              minTickGap={28}
              tickMargin={8}
            />
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
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!p) return null;
                const below = buffer !== null && p.al < buffer ? buffer - p.al : 0;
                return (
                  <ChartTooltipBox
                    title={
                      <>
                        {p.day === 0 ? "T₀ · " : `Day ${p.day} · `}
                        {formatWeekday(p.date)} {formatDate(p.date)}
                      </>
                    }
                    rows={[
                      { key: "al", label: "Available", value: <Money value={toDecimal(p.al)} currency={ccy} compact colored={false} />, color: C.accent, shape: "dash" },
                      ...(p.inflows !== null
                        ? [
                            { key: "in", label: "Inflows", value: <Money value={toDecimal(p.inflows)} currency={ccy} compact colored={false} />, color: C.in, shape: "rect" as const },
                            { key: "out", label: "Outflows", value: <Money value={toDecimal(p.outflows ?? 0)} currency={ccy} compact colored={false} />, color: C.out, shape: "rect" as const },
                            { key: "net", label: "Net", value: <Money value={toDecimal(p.net ?? 0)} currency={ccy} compact sign="always" /> },
                          ]
                        : [{ key: "open", label: "Opening position", value: "" }]),
                    ]}
                    footer={below > 0 ? <span className="text-warning">Below buffer by {formatCompact(toDecimal(below))} {ccy}</span> : undefined}
                  />
                );
              }}
            />
            <Area type="linear" dataKey="al" stroke="none" fill="url(#al-wash)" isAnimationActive={false} />
            {buffer !== null && (
              <ReferenceLine
                y={buffer}
                stroke={C.warning}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                label={{ value: `Min buffer ${formatCompact(toDecimal(buffer))}`, position: "insideTopLeft", fill: C.muted, fontSize: 11 }}
              />
            )}
            <Line
              type="linear"
              dataKey="al"
              stroke={C.accent}
              strokeWidth={MARK.line}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: MARK.dot, fill: C.accent, stroke: C.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            {breach && buffer !== null && (
              <ReferenceDot x={breach.date} y={buffer} r={5} fill={C.surface} stroke={C.warning} strokeWidth={2} />
            )}
            {min && breach && (
              <ReferenceDot
                x={min.date}
                y={min.al}
                r={MARK.dot}
                fill={C.warning}
                stroke={C.surface}
                strokeWidth={2}
                label={{ value: `Low ${formatCompact(toDecimal(min.al))}`, position: "bottom", fill: C.muted, fontSize: 11, offset: 10 }}
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
              <Th numeric>Inflows</Th>
              <Th numeric>Outflows</Th>
              <Th numeric>Net</Th>
              <Th numeric>Available</Th>
            </tr>
          </THead>
          <tbody>
            {points.map((p) => (
              <Tr key={p.date} className={buffer !== null && p.al < buffer ? "bg-warning-soft" : undefined}>
                <Td className="num">
                  {p.day === 0 ? "T₀ " : ""}
                  {formatDate(p.date)}
                </Td>
                <Td numeric>{p.inflows === null ? "" : <Money value={toDecimal(p.inflows)} currency={ccy} hideCurrency />}</Td>
                <Td numeric>{p.outflows === null ? "" : <Money value={toDecimal(p.outflows)} currency={ccy} hideCurrency />}</Td>
                <Td numeric>{p.net === null ? "" : <Money value={toDecimal(p.net)} currency={ccy} hideCurrency sign="always" />}</Td>
                <Td numeric className="font-medium">
                  <Money value={toDecimal(p.al)} currency={ccy} hideCurrency colored={false} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    />
  );
}
