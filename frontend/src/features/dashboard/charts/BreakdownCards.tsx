import { useState } from "react";
import { useNavigate } from "react-router";
import { ChartCard } from "@/components/charts";
import { Money, SegmentedControl, Table, Td, Th, THead, Tr } from "@/components/ui";
import { formatCompact, formatDecimal, formatPercent } from "@/lib/format";
import type { CurrencyFilter } from "@/mocks/dashboard";
import { cardState, useConcentration, useCurrencyDistribution } from "../queries";
import { RankedBars } from "./RankedBars";

/** Opening liquidity by currency, ranked. The currency filter highlights its row (emphasis). */
export function CurrencyCard({ currency, onPick }: { currency: CurrencyFilter; onPick: (c: CurrencyFilter) => void }) {
  const q = useCurrencyDistribution();
  const d = q.data;
  const max = d ? Math.max(...d.items.map((i) => Number(i.share))) : 1;
  return (
    <ChartCard
      title="Liquidity by currency"
      subtitle={d ? `Opening liquidity · ${formatCompact(d.total)} ${d.base_currency} equivalent · all currencies` : "Opening liquidity"}
      height={7 * 36 + 4}
      grow
      {...cardState(q)}
      footer="Select a currency to filter the dashboard."
      chart={() => (
        <RankedBars
          labelWidth="3.25rem"
          items={(d?.items ?? []).map((i) => ({
            id: i.currency,
            label: <span className="font-mono">{i.currency}</span>,
            fraction: Number(i.share) / max,
            value: formatPercent(i.share, { dp: 1 }),
            detail: `${formatCompact(i.amount_base)} ${d!.base_currency}`,
            description: `${i.currency}: ${formatPercent(i.share, { dp: 1 })} of opening liquidity, ${formatCompact(i.amount)} ${i.currency} (${formatCompact(i.amount_base)} ${d!.base_currency})`,
            emphasised: currency === i.currency,
            onSelect: () => onPick(currency === i.currency ? "ALL" : i.currency),
          }))}
        />
      )}
      table={() => (
        <Table>
          <THead>
            <tr>
              <Th>Currency</Th>
              <Th numeric>Amount</Th>
              <Th numeric>Base equivalent</Th>
              <Th numeric>Share</Th>
            </tr>
          </THead>
          <tbody>
            {(d?.items ?? []).map((i) => (
              <Tr key={i.currency}>
                <Td mono>{i.currency}</Td>
                <Td numeric><Money value={i.amount} currency={i.currency} /></Td>
                <Td numeric><Money value={i.amount_base} currency={d!.base_currency} /></Td>
                <Td numeric>{formatPercent(i.share, { dp: 1 })}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    />
  );
}

/** HHI bands from TECHNICAL_PLAN §5.10 (configurable conventions, not standards). */
function hhiBand(hhi: number): string {
  return hhi < 0.1 ? "low" : hhi < 0.18 ? "moderate" : "high";
}

export function ConcentrationCard() {
  const [basis, setBasis] = useState<"funding" | "credit">("funding");
  const q = useConcentration(basis);
  const navigate = useNavigate();
  const d = q.data;
  const limit = d ? Number(d.single_name_limit) : 0.1;
  const max = d ? Math.max(limit * 1.6, ...d.items.map((i) => Number(i.share))) : 1;
  const hhi = d ? Number(d.hhi) : 0;

  return (
    <ChartCard
      title="Counterparty concentration"
      subtitle={d ? `Top 10 of ${d.items.length + d.others.count} · ${formatCompact(d.total)} ${d.currency} · all currencies` : "Top 10 counterparties"}
      height={10 * 36 + 24}
      grow
      {...cardState(q)}
      legend={
        d && (
          <div className="flex flex-col gap-2">
          <SegmentedControl
            size="sm"
            label="Exposure basis"
            value={basis}
            onChange={setBasis}
            options={[
              { value: "funding", label: "Funding provided" },
              { value: "credit", label: "Credit extended" },
            ]}
          />
          <dl className="grid grid-cols-4 gap-2 rounded-md bg-surface-2 px-3 py-2">
            {[
              { k: "HHI", v: formatDecimal(d.hhi, { dp: 3 }), s: hhiBand(hhi) },
              { k: "Effective N", v: formatDecimal(d.effective_n, { dp: 1 }), s: "names" },
              { k: "Top 1", v: formatPercent(d.top_share_1, { dp: 1 }), s: "share" },
              { k: "Top 5", v: formatPercent(d.top_share_5, { dp: 1 }), s: "share" },
            ].map((m) => (
              <div key={m.k} className="min-w-0">
                <dt className="text-2xs text-fg-faint">{m.k}</dt>
                <dd className="text-sm font-semibold text-fg">
                  {m.v} <span className="text-2xs font-normal text-fg-faint">{m.s}</span>
                </dd>
              </div>
            ))}
          </dl>
          </div>
        )
      }
      chart={() => (
        <RankedBars
          labelWidth="minmax(0, 11rem)"
          limit={{ fraction: limit / max, label: `Single-name limit ${formatPercent(d!.single_name_limit, { dp: 0 })}` }}
          items={(d?.items ?? []).map((i) => {
            const over = Number(i.share) > limit;
            return {
              id: i.counterparty_id,
              label: i.name,
              fraction: Number(i.share) / max,
              value: formatPercent(i.share, { dp: 1 }),
              detail: `${formatCompact(i.exposure)}${over ? " · over limit" : ""}`,
              description: `${i.name}: ${formatPercent(i.share, { dp: 1 })} of ${basis}, ${formatCompact(i.exposure)} ${d!.currency}${over ? ", above the single-name limit" : ""}`,
              flagged: over,
              onSelect: () => navigate(`/data/counterparties?id=${i.counterparty_id}`),
            };
          })}
        />
      )}
      table={() => (
        <Table>
          <THead>
            <tr>
              <Th>Counterparty</Th>
              <Th numeric>Exposure ({d?.currency})</Th>
              <Th numeric>Share</Th>
            </tr>
          </THead>
          <tbody>
            {(d?.items ?? []).map((i) => (
              <Tr key={i.counterparty_id}>
                <Td>{i.name}</Td>
                <Td numeric><Money value={i.exposure} currency={d!.currency} hideCurrency /></Td>
                <Td numeric>{formatPercent(i.share, { dp: 1 })}</Td>
              </Tr>
            ))}
            {d && (
              <Tr>
                <Td className="text-fg-muted">Others ({d.others.count})</Td>
                <Td numeric><Money value={d.others.exposure} currency={d.currency} hideCurrency /></Td>
                <Td numeric>{formatPercent(d.others.share, { dp: 1 })}</Td>
              </Tr>
            )}
          </tbody>
        </Table>
      )}
    />
  );
}
