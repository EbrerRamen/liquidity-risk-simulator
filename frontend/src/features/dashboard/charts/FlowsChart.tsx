import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { AXIS_TICK, C, ChartCard, ChartTooltipBox, Legend, MARK, niceScale, tickDate, tickMoney } from "@/components/charts";
import { Badge, buttonClass, Money, Table, Td, Th, THead, Tr } from "@/components/ui";
import { formatDate, formatDateShort } from "@/lib/format";
import { toDecimal } from "@/lib/numbers";
import type { DashboardFilters, FlowBucket } from "@/mocks/dashboard";
import { cardState, useFlows } from "../queries";

interface Row {
  start: string;
  end: string;
  kind: FlowBucket["kind"];
  inflows: number;
  outflows: number; // plotted negative
  net: number;
}

const PROJECTED_OPACITY = 0.45;

export function FlowsChart({ filters }: { filters: DashboardFilters }) {
  const q = useFlows(filters);
  const d = q.data;
  const ccy = d?.currency ?? "USD";
  const weekly = d?.granularity === "week";
  const rows: Row[] = (d?.buckets ?? []).map((b) => ({
    start: b.start,
    end: b.end,
    kind: b.kind,
    inflows: Number(b.inflows),
    outflows: -Number(b.outflows),
    net: Number(b.net),
  }));
  const firstProjected = rows.find((r) => r.kind === "projected");
  const period = (r: Row) => (weekly ? `${formatDateShort(r.start)} – ${formatDateShort(r.end)}` : formatDate(r.start));

  const vals = rows.flatMap((r) => [r.inflows, r.outflows]);
  const y = niceScale(Math.min(0, ...vals), Math.max(0, ...vals), 5);

  return (
    <ChartCard
      title="Inflows and outflows"
      subtitle={`${ccy} · ${weekly ? "weekly" : "daily"} · last ${filters.lookback} days actual, next ${filters.horizon} days projected`}
      height={240}
      {...cardState(q)}
      actions={
        <Link to="/data/cash-flows" className={buttonClass("ghost", "sm", "text-fg-muted")}>
          Cash flows <ArrowUpRight />
        </Link>
      }
      legend={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Legend
            items={[
              { label: "Inflows", color: C.in, shape: "rect" },
              { label: "Outflows", color: C.out, shape: "rect" },
            ]}
          />
          <span className="text-2xs text-fg-faint">Shaded, lighter bars: projected</span>
        </div>
      }
      chart={() => (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} stackOffset="sign" barGap={MARK.barGap} margin={{ top: 18, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="start" tickFormatter={tickDate} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={28} tickMargin={8} />
            <YAxis tickFormatter={tickMoney} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} domain={y.domain} ticks={y.ticks} />
            <ReferenceLine y={0} stroke={C.axis} />
            {firstProjected && (
              <ReferenceArea
                x1={firstProjected.start}
                x2={rows[rows.length - 1]!.start}
                fill="var(--color-hover)"
                fillOpacity={0.6}
                ifOverflow="extendDomain"
                label={{ value: "Projected", position: "insideTop", fill: C.muted, fontSize: 11, offset: -14 }}
              />
            )}
            <Tooltip
              cursor={{ fill: "var(--color-hover)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                if (!r) return null;
                return (
                  <ChartTooltipBox
                    title={
                      <span className="flex items-center gap-2">
                        {period(r)}
                        <Badge tone={r.kind === "actual" ? "neutral" : "accent"}>{r.kind === "actual" ? "Actual" : "Projected"}</Badge>
                      </span>
                    }
                    rows={[
                      { key: "in", label: "Inflows", value: <Money value={toDecimal(r.inflows)} currency={ccy} compact colored={false} />, color: C.in, shape: "rect" },
                      { key: "out", label: "Outflows", value: <Money value={toDecimal(-r.outflows)} currency={ccy} compact colored={false} />, color: C.out, shape: "rect" },
                      { key: "net", label: "Net", value: <Money value={toDecimal(r.net)} currency={ccy} compact sign="always" /> },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="inflows" stackId="flow" fill={C.in} maxBarSize={MARK.barMax} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.start} fillOpacity={r.kind === "projected" ? PROJECTED_OPACITY : 1} />
              ))}
            </Bar>
            <Bar dataKey="outflows" stackId="flow" fill={C.out} maxBarSize={MARK.barMax} radius={[0, 0, 3, 3]} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.start} fillOpacity={r.kind === "projected" ? PROJECTED_OPACITY : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      table={() => (
        <Table>
          <THead>
            <tr>
              <Th>{weekly ? "Week" : "Date"}</Th>
              <Th>Type</Th>
              <Th numeric>Inflows</Th>
              <Th numeric>Outflows</Th>
              <Th numeric>Net</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.start + r.kind}>
                <Td className="num">{period(r)}</Td>
                <Td className="text-fg-muted">{r.kind === "actual" ? "Actual" : "Projected"}</Td>
                <Td numeric><Money value={toDecimal(r.inflows)} currency={ccy} hideCurrency /></Td>
                <Td numeric><Money value={toDecimal(-r.outflows)} currency={ccy} hideCurrency /></Td>
                <Td numeric><Money value={toDecimal(r.net)} currency={ccy} hideCurrency sign="always" /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    />
  );
}
