import { useCallback } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Users } from "lucide-react";
import { counterpartiesApi, type CounterpartyFilters, type CounterpartyListItem } from "@/api/counterparties";
import { ResourceListPage } from "@/components/data";
import { Badge, Money, RiskBadge, Tooltip, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { BANDS, BAND_LABEL, COUNTERPARTY_TYPES, COUNTERPARTY_TYPE_LABEL, COUNTRIES, countryName } from "@/mocks/reference";
import { useCan } from "../data-shared/shared";
import { CounterpartyDetail } from "./CounterpartyDetail";
import { CounterpartyEditor } from "./CounterpartyEditor";

const col = createColumnHelper<CounterpartyListItem>();

export function CounterpartiesPage() {
  const can = useCan();
  const toast = useToast();

  const columns = useCallback(
    (open: (id: string) => void) => [
      col.accessor("name", {
        header: "Name",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => open(row.original.id)} className="max-w-72 truncate rounded-sm text-left font-medium text-fg hover:text-accent-strong hover:underline">
              {row.original.name}
            </button>
            {!row.original.is_active && <Badge>Inactive</Badge>}
          </span>
        ),
      }),
      col.accessor("counterparty_type", { header: "Type", cell: (c) => <span className="text-fg-muted">{COUNTERPARTY_TYPE_LABEL[c.getValue()]}</span>, meta: { hideBelow: "md" } }),
      col.accessor("country_code", {
        header: "Country",
        cell: (c) => (
          <span className="text-fg-muted" title={countryName(c.getValue())}>
            <span className="font-mono text-xs text-fg">{c.getValue()}</span> <span className="max-xl:hidden">{countryName(c.getValue())}</span>
          </span>
        ),
        meta: { hideBelow: "lg" },
      }),
      col.accessor("credit_rating", { header: "Rating", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
      col.accessor("risk_classification", { header: "Analyst risk", cell: (c) => <RiskBadge band={c.getValue()} />, meta: { hint: "Analyst-assigned risk classification" } }),
      // Derived columns use an accessor function so TanStack treats them as sortable;
      // the id is the API's sort field. Sorting itself happens on the server.
      col.accessor((r) => r.latest_assessment?.band ?? "", {
        id: "model_band",
        header: "Model risk",
        cell: ({ row }) => {
          const a = row.original.latest_assessment;
          if (!a) return <span className="text-xs text-fg-faint">Not assessed</span>;
          const differs = a.band !== row.original.risk_classification;
          return (
            <span className="flex items-center gap-1.5">
              <RiskBadge band={a.band} />
              {differs && (
                <Tooltip content={`Model says ${BAND_LABEL[a.band]}, analyst says ${BAND_LABEL[row.original.risk_classification]}`}>
                  <Badge tone="caution">Differs</Badge>
                </Tooltip>
              )}
            </span>
          );
        },
        meta: { hint: "Latest model assessment band" },
      }),
      col.accessor((r) => r.exposure.funding, {
        id: "funding",
        header: "Funding (USD)",
        cell: ({ row }) => (Number(row.original.exposure.funding) === 0 ? <span className="text-fg-faint">–</span> : <Money value={row.original.exposure.funding} currency="USD" compact hideCurrency />),
        meta: { numeric: true, hint: "Funding provided: borrowed principal plus utilised funding, USD equivalent" },
      }),
      col.accessor((r) => r.exposure.credit, {
        id: "credit",
        header: "Credit (USD)",
        cell: ({ row }) => (Number(row.original.exposure.credit) === 0 ? <span className="text-fg-faint">–</span> : <Money value={row.original.exposure.credit} currency="USD" compact hideCurrency />),
        meta: { numeric: true, hideBelow: "xl", hint: "Credit exposure: lent principal plus securities issued, USD equivalent" },
      }),
      col.accessor("open_deals", { header: "Deals", meta: { numeric: true, hideBelow: "lg", hint: "Open money-market deals" } }),
      col.accessor("updated_at", { header: "Updated", cell: (c) => <span className="num text-fg-muted">{formatDate(c.getValue().slice(0, 10))}</span>, meta: { hideBelow: "2xl" } }),
    ],
    [],
  );

  return (
    <ResourceListPage<CounterpartyListItem>
      title="Counterparties"
      description="Banks, corporates, funds and sovereigns you lend to, borrow from or hold securities of."
      noun={["counterparty", "counterparties"]}
      searchPlaceholder="Search name or ID"
      defaultSort="name"
      filters={[
        { kind: "multi", key: "counterparty_type", label: "Type", options: COUNTERPARTY_TYPES.map((t) => ({ value: t, label: COUNTERPARTY_TYPE_LABEL[t] })) },
        { kind: "multi", key: "country_code", label: "Country", options: [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })) },
        { kind: "multi", key: "risk_classification", label: "Analyst risk", options: BANDS.map((b) => ({ value: b, label: BAND_LABEL[b] })) },
        { kind: "multi", key: "model_band", label: "Model risk", options: BANDS.map((b) => ({ value: b, label: BAND_LABEL[b] })) },
        { kind: "toggle", key: "disagreement", label: "Model disagrees" },
        {
          kind: "segmented",
          key: "status",
          label: "Status",
          defaultValue: "active",
          options: [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "all", label: "All" },
          ],
        },
      ]}
      columns={columns}
      rowId={(r) => r.id}
      listQuery={(p) => ({ queryKey: ["counterparties", "list", p], queryFn: () => counterpartiesApi.list(p as CounterpartyFilters) })}
      exportCsv={(p) => counterpartiesApi.exportCsv(p as CounterpartyFilters)}
      canCreate={can.analyst}
      canEdit={can.analyst}
      renderDetail={(id, nav) => <CounterpartyDetail id={id} onClose={nav.close} onEdit={nav.edit} onDeleted={nav.close} />}
      renderEditor={(id, nav) => (
        <CounterpartyEditor
          id={id}
          onClose={nav.closeEditor}
          onSaved={(saved, created) => {
            toast.show({ tone: "positive", title: created ? `${saved.name} created` : "Changes saved", detail: created ? undefined : `${saved.name} · version ${saved.version}` });
            if (created) nav.view(saved.id);
            else nav.closeEditor();
          }}
        />
      )}
      empty={{ icon: <Users />, title: "No counterparties here", description: "Inactive counterparties show under Inactive. Add the banks, corporates and funds you deal with." }}
    />
  );
}
