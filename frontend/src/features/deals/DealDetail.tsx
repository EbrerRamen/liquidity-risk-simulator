import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Ban, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { dealsApi, type Deal } from "@/api/deals";
import { isApiError } from "@/api/problem";
import { DetailSection, DetailSkeleton, KeyValueList, MetricTile, RecordSection, type PanelNav } from "@/components/data";
import { Alert, Button, ConfirmDialog, Drawer, IconButton, Menu, Money, Table, Td, Th, THead, Tooltip, Tr, useToast } from "@/components/ui";
import { formatDate, formatPercent } from "@/lib/format";
import { DAY_COUNT_LABEL, DEAL_TYPE_LABEL, FREQUENCY_LABEL } from "@/mocks/reference";
import { CashFlowStatusBadge, DealDirection, DealStatusBadge, FlowDirection, useCan, useWrite } from "../data-shared/shared";

function sentence(d: Deal): string {
  const verb = d.direction === "LEND" ? "Lending" : "Borrowing";
  const prep = d.direction === "LEND" ? "to" : "from";
  return `${verb} ${Number(d.principal).toLocaleString("en", { minimumFractionDigits: d.currency_code === "JPY" ? 0 : 2 })} ${d.currency_code} ${prep} ${d.counterparty_name} at ${formatPercent(d.interest_rate, { dp: 3 })} ${DAY_COUNT_LABEL[d.day_count]} for ${d.tenor_days} days, interest ${FREQUENCY_LABEL[d.interest_frequency].toLowerCase()}.`;
}

/** Why the terms can't be edited, or null when they can. */
export function editBlock(d: Pick<Deal, "settlement_status" | "locked">): string | null {
  if (d.settlement_status === "CANCELLED" || d.settlement_status === "FAILED" || d.settlement_status === "MATURED") return `A ${d.settlement_status.toLowerCase()} deal can't be amended.`;
  if (d.locked) return "Cash flows have settled, so the terms are locked. Cancel the deal and book a new one to change them.";
  return null;
}

export function DealDetail({ id, nav }: { id: string; nav: PanelNav }) {
  const can = useCan();
  const toast = useToast();
  const q = useQuery({ queryKey: ["deals", "detail", id], queryFn: () => dealsApi.get(id) });
  const flows = useQuery({ queryKey: ["deals", "flows", id], queryFn: () => dealsApi.cashFlows(id) });
  const cancel = useWrite((d: Deal) => dealsApi.cancel(d.id, d.version), "deals");
  const remove = useWrite((d: Deal) => dealsApi.remove(d.id, d.version));
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = q.data;
  const block = d ? editBlock(d) : null;
  const live = d && (d.settlement_status === "PENDING" || d.settlement_status === "SETTLED");

  const run = async (kind: "cancel" | "delete") => {
    if (!d) return;
    setError(null);
    try {
      if (kind === "cancel") {
        await cancel.mutateAsync(d);
        toast.show({ tone: "positive", title: `${d.deal_reference} cancelled`, detail: `${d.flows.projected} projected cash flows cancelled.` });
      } else {
        await remove.mutateAsync(d);
        toast.show({ tone: "positive", title: `${d.deal_reference} deleted`, detail: "Recorded in the audit log." });
        nav.close();
      }
      setConfirm(null);
    } catch (e) {
      setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server.");
    }
  };

  const actions = d && can.analyst && (
    <>
      {block ? (
        <Tooltip content={<span className="block max-w-64">{block}</span>} align="end" side="bottom">
          <Button size="sm" icon={<Pencil />} disabled aria-disabled>
            Edit
          </Button>
        </Tooltip>
      ) : (
        <Button size="sm" icon={<Pencil />} onClick={nav.edit}>
          Edit
        </Button>
      )}
      <Menu
        label="More actions"
        trigger={(p) => (
          <IconButton label="More actions" {...p}>
            <MoreHorizontal />
          </IconButton>
        )}
        items={[
          { label: "Cancel deal", icon: <Ban />, disabled: !live, hint: "Only live or pending deals can be cancelled.", onSelect: () => setConfirm("cancel") },
          ...(can.admin
            ? [{ label: "Delete permanently", icon: <Trash2 />, tone: "danger" as const, disabled: d.locked, hint: "Cash flows have settled. Cancel the deal instead.", onSelect: () => setConfirm("delete") }]
            : []),
        ]}
      />
    </>
  );

  const net = d ? Number(d.net_interest) : 0;

  return (
    <>
      <Drawer
        open
        width="lg"
        onClose={nav.close}
        title={<span className="font-mono">{d?.deal_reference ?? (q.isError ? "Deal" : "Loading…")}</span>}
        subtitle={
          d && (
            <span className="flex flex-wrap items-center gap-1.5">
              {DEAL_TYPE_LABEL[d.deal_type]} ·{" "}
              <Link to={`/data/counterparties?id=${d.counterparty_id}`} className="text-accent hover:text-accent-strong">
                {d.counterparty_name}
              </Link>
              <DealStatusBadge status={d.settlement_status} locked={d.locked} />
            </span>
          )
        }
        headerActions={actions}
      >
        {q.isPending ? (
          <DetailSkeleton />
        ) : q.isError ? (
          <div className="p-5">
            <Alert tone="negative" title={isApiError(q.error) && q.error.status === 404 ? "This deal no longer exists" : "Couldn't load this deal"}>
              {q.error.message}
            </Alert>
          </div>
        ) : (
          d && (
            <>
              <div className="flex flex-col gap-3 px-5 pt-4">
                <p className="text-sm text-fg">{sentence(d)}</p>
                {d.locked && live && (
                  <Alert tone="info" title="Terms are locked">
                    Cash flows have settled. To change the terms, cancel the deal and book a new one (TECHNICAL_PLAN C10).
                  </Alert>
                )}
              </div>

              <DetailSection title="Terms" className="mt-1">
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <MetricTile label="Principal" sub={d.currency_code === "USD" ? undefined : `≈ ${Number(d.principal_base).toLocaleString("en", { maximumFractionDigits: 0 })} USD`}>
                    <Money value={d.principal} currency={d.currency_code} compact tabular={false} />
                  </MetricTile>
                  <MetricTile label="Rate">{formatPercent(d.interest_rate, { dp: 3 })}</MetricTile>
                  <MetricTile label={net >= 0 ? "Interest received" : "Interest paid"}>
                    <Money value={String(Math.abs(net))} currency={d.currency_code} compact tabular={false} colored={false} />
                  </MetricTile>
                </div>
                <KeyValueList
                  rows={[
                    ["Direction", <DealDirection key="d" direction={d.direction} />],
                    ["Day count", DAY_COUNT_LABEL[d.day_count]],
                    ["Interest", FREQUENCY_LABEL[d.interest_frequency]],
                    ["Trade date", <span key="t" className="num">{formatDate(d.deal_date)}</span>],
                    ["Value date", <span key="v" className="num">{formatDate(d.value_date)}</span>],
                    ["Maturity", <span key="m" className="num">{formatDate(d.maturity_date)} · {d.tenor_days} days</span>],
                  ]}
                />
              </DetailSection>

              <DetailSection
                title={`Cash-flow schedule · ${d.flows.total} flows`}
                action={
                  <Link to={`/data/cash-flows?deal_id=${d.id}&view=all`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-strong">
                    Open in Cash Flows <ArrowRight className="size-3" aria-hidden />
                  </Link>
                }
              >
                {flows.isPending ? (
                  <DetailSkeleton />
                ) : (
                  <div className="-mx-5">
                    <Table>
                      <THead>
                        <tr>
                          <Th>Date</Th>
                          <Th>Flow</Th>
                          <Th>Direction</Th>
                          <Th numeric>Amount</Th>
                          <Th>Status</Th>
                        </tr>
                      </THead>
                      <tbody>
                        {flows.data?.map((f) => (
                          <Tr key={f.id}>
                            <Td className="num">{formatDate(f.expected_date)}</Td>
                            <Td className="text-fg-muted">{f.category === "PRINCIPAL" ? "Principal" : "Interest"}</Td>
                            <Td>
                              <FlowDirection direction={f.direction} />
                            </Td>
                            <Td numeric>
                              <Money value={f.amount} currency={f.currency_code} colored={false} />
                            </Td>
                            <Td>
                              <CashFlowStatusBadge status={f.status} overdue={f.overdue} />
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </DetailSection>

              <RecordSection record={d} />
            </>
          )
        )}
      </Drawer>

      <ConfirmDialog
        open={confirm === "cancel"}
        title={`Cancel ${d?.deal_reference ?? "deal"}?`}
        body={
          <>
            Its {d?.flows.projected ?? 0} projected cash flows are cancelled and drop out of liquidity projections. Settled flows stay in the history.
            {error && <Alert tone="negative" title="Couldn't cancel" className="mt-3">{error}</Alert>}
          </>
        }
        confirmLabel="Cancel deal"
        tone="danger"
        busy={cancel.isPending}
        onCancel={() => {
          setConfirm(null);
          setError(null);
        }}
        onConfirm={() => void run("cancel")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title={`Delete ${d?.deal_reference ?? "deal"} permanently?`}
        body={
          <>
            The deal and its cash-flow schedule are removed. This can't be undone and is recorded in the audit log.
            {error && <Alert tone="negative" title="Couldn't delete" className="mt-3">{error}</Alert>}
          </>
        }
        confirmLabel="Delete"
        tone="danger"
        busy={remove.isPending}
        onCancel={() => {
          setConfirm(null);
          setError(null);
        }}
        onConfirm={() => void run("delete")}
      />
    </>
  );
}
