import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_TICK, C, ChartCard, ChartTooltipBox, Legend, MARK, niceScale, tickMoney } from "@/components/charts";
import { Money, Table, Td, Th, THead, Tr } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { toDecimal } from "@/lib/numbers";
import type { DashboardFilters, MaturityBucket } from "@/mocks/dashboard";
import { cardState, useMaturitySchedule } from "../queries";

interface Row extends MaturityBucket {
  received: number;
  repaid: number; // plotted negative
}

export function MaturityChart({ filters, asOf }: { filters: DashboardFilters; asOf: string }) {
  const q = useMaturitySchedule(filters);
  const navigate = useNavigate();
  const d = q.data;
  const ccy = d?.currency ?? "USD";
  const rows: Row[] = (d?.buckets ?? []).map((b) => ({ ...b, received: Number(b.lend), repaid: -Number(b.borrow) }));

  const drill = (r: Row) => {
    const p = new URLSearchParams({ maturity_from: addDays(asOf, r.from_day), maturity_to: addDays(asOf, r.to_day) });
    if (filters.currency !== "ALL") p.set("currency", filters.currency);
    navigate(`/data/deals?${p}`);
  };

  const vals = rows.flatMap((r) => [r.received, r.repaid]);
  const y = niceScale(Math.min(0, ...vals), Math.max(0, ...vals), 5);

  return (
    <ChartCard
      title="Maturity schedule"
      subtitle={`${ccy} · deal principal by ladder bucket`}
      height={240}
      grow
      {...cardState(q)}
      legend={
        <Legend
          items={[
            { label: "Received (LEND)", color: C.in, shape: "rect" },
            { label: "Repaid (BORROW)", color: C.out, shape: "rect" },
          ]}
        />
      }
      footer="Select a bucket to open its deals."
      chart={() => (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickFormatter={tickMoney} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} domain={y.domain} ticks={y.ticks} />
            <ReferenceLine y={0} stroke={C.axis} />
            <Tooltip
              cursor={{ fill: "var(--color-hover)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                if (!r) return null;
                return (
                  <ChartTooltipBox
                    title={`${r.bucket} · days ${r.from_day}–${r.to_day}`}
                    rows={[
                      { key: "rec", label: `Received · ${r.lend_count} deals`, value: <Money value={r.lend} currency={ccy} compact colored={false} />, color: C.in, shape: "rect" },
                      { key: "rep", label: `Repaid · ${r.borrow_count} deals`, value: <Money value={r.borrow} currency={ccy} compact colored={false} />, color: C.out, shape: "rect" },
                      { key: "gap", label: "Mismatch", value: <Money value={toDecimal(r.received + r.repaid)} currency={ccy} compact sign="always" /> },
                    ]}
                    footer="Click to open these deals"
                  />
                );
              }}
            />
            <Bar dataKey="received" stackId="m" fill={C.in} maxBarSize={MARK.barMax} radius={[4, 4, 0, 0]} isAnimationActive={false} className="cursor-pointer" onClick={(e) => drill(e.payload as Row)} />
            <Bar dataKey="repaid" stackId="m" fill={C.out} maxBarSize={MARK.barMax} radius={[0, 0, 4, 4]} isAnimationActive={false} className="cursor-pointer" onClick={(e) => drill(e.payload as Row)} />
          </BarChart>
        </ResponsiveContainer>
      )}
      table={() => (
        <Table>
          <THead>
            <tr>
              <Th>Bucket</Th>
              <Th numeric>Received</Th>
              <Th numeric>Repaid</Th>
              <Th numeric>Mismatch</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.bucket}>
                <Td>{r.bucket}</Td>
                <Td numeric><Money value={r.lend} currency={ccy} hideCurrency /></Td>
                <Td numeric><Money value={r.borrow} currency={ccy} hideCurrency /></Td>
                <Td numeric><Money value={toDecimal(r.received + r.repaid)} currency={ccy} hideCurrency sign="always" /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    />
  );
}
