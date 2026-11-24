import { useState } from "react";
import { Link } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Ban, CheckCircle2, MoreHorizontal, Pencil, Trash2, XCircle } from "lucide-react";
import { cashFlowsApi, type CashFlow } from "@/api/cashFlows";
import { isApiError } from "@/api/problem";
import { useSession } from "@/app/session";
import { applyServerErrors, DetailSection, DetailSkeleton, FormBanner, KeyValueList, MetricTile, RecordSection, type Banner, type PanelNav } from "@/components/data";
import { Alert, Button, ConfirmDialog, Dialog, Drawer, Field, IconButton, Input, Menu, Money, MoneyInput, useToast } from "@/components/ui";
import { isDecimal } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { CF_CATEGORY_LABEL, CF_SOURCE_LABEL } from "@/mocks/reference";
import { CashFlowStatusBadge, FlowDirection, useCan, useWrite } from "../data-shared/shared";

const SETTLE_FIELDS = ["actual_date", "settled_amount", "note"] as const;

function SettleDialog({ flow, onClose, onDone }: { flow: CashFlow; onClose: () => void; onDone: () => void }) {
  const { system } = useSession();
  const t0 = system.businessDate;
  const settle = useWrite((v: { actual_date: string; settled_amount: string; note: string }) => cashFlowsApi.settle(flow.id, { ...v, version: flow.version }), "cash-flows");
  const [banner, setBanner] = useState<Banner | null>(null);
  const schema = z
    .object({
      actual_date: z.string().min(1, { error: "Enter the settlement date" }),
      settled_amount: z.string().refine((v) => isDecimal(v) && Number(v) >= 0, { error: "Enter the amount received or paid" }),
      note: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.actual_date > t0) ctx.addIssue({ code: "custom", path: ["actual_date"], message: `Can't be after the business date (${formatDate(t0)})` });
      if (isDecimal(v.settled_amount) && Number(v.settled_amount) !== Number(flow.amount) && !v.note.trim())
        ctx.addIssue({ code: "custom", path: ["note"], message: "Explain why the amount differs from the expected amount" });
    });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { actual_date: flow.expected_date < t0 ? flow.expected_date : t0, settled_amount: flow.amount, note: "" },
  });
  const { register, control, handleSubmit, formState, setError, watch } = form;
  const amount = watch("settled_amount");
  const diff = isDecimal(amount) ? Number(amount) - Number(flow.amount) : 0;

  const submit = handleSubmit(async (v) => {
    setBanner(null);
    try {
      await settle.mutateAsync(v);
      onDone();
    } catch (e) {
      setBanner(applyServerErrors(e, setError, SETTLE_FIELDS));
    }
  });

  return (
    <Dialog
      open
      onClose={settle.isPending ? () => undefined : onClose}
      title={`Settle ${flow.transaction_reference}`}
      footer={
        <>
          <Button onClick={onClose} disabled={settle.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="settle-form" variant="primary" loading={settle.isPending}>
            Record settlement
          </Button>
        </>
      }
    >
      <form id="settle-form" onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
        <p className="text-xs text-fg-muted">
          Expected {flow.direction === "IN" ? "in" : "out"} <Money value={flow.amount} currency={flow.currency_code} colored={false} /> on {formatDate(flow.expected_date)}. Settling moves it from projections into the {flow.currency_code} cash balance.
        </p>
        <FormBanner banner={banner} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Settlement date" required error={formState.errors.actual_date?.message}>
            {(p) => <Input {...p} type="date" max={t0} {...register("actual_date")} />}
          </Field>
          <Field
            label="Amount settled"
            required
            error={formState.errors.settled_amount?.message}
            hint={diff !== 0 ? <span className="text-warning">{diff > 0 ? "+" : "−"}{Math.abs(diff).toLocaleString("en", { minimumFractionDigits: flow.currency_code === "JPY" ? 0 : 2 })} vs expected</span> : "Matches the expected amount"}
          >
            {(p) => (
              <Controller control={control} name="settled_amount" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={flow.currency_code} />} />
            )}
          </Field>
        </div>
        <Field label="Note" error={formState.errors.note?.message} hint="Required when the amount differs">
          {(p) => <Input {...p} {...register("note")} placeholder="e.g. Partial payment, balance due 20 Nov" />}
        </Field>
      </form>
    </Dialog>
  );
}

function FailDialog({ flow, onClose, onDone }: { flow: CashFlow; onClose: () => void; onDone: () => void }) {
  const fail = useWrite((note: string) => cashFlowsApi.fail(flow.id, { version: flow.version, note }), "cash-flows");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dealPrincipal = !!flow.deal_id && flow.category === "PRINCIPAL";
  const run = async () => {
    if (note.trim().length < 5) return setError("Give the reason (at least 5 characters).");
    setError(null);
    try {
      await fail.mutateAsync(note.trim());
      onDone();
    } catch (e) {
      setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server.");
    }
  };
  return (
    <Dialog
      open
      tone="danger"
      onClose={fail.isPending ? () => undefined : onClose}
      title={`Mark ${flow.transaction_reference} as failed?`}
      footer={
        <>
          <Button onClick={onClose} disabled={fail.isPending}>
            Cancel
          </Button>
          <Button variant="danger" loading={fail.isPending} onClick={() => void run()}>
            Mark as failed
          </Button>
        </>
      }
    >
      <p>The flow leaves the projections and stays in the history as failed.</p>
      {dealPrincipal && flow.deal_reference && (
        <Alert tone="warning" title="Deal principal" className="mt-3">
          If this is the value-date principal of {flow.deal_reference}, the deal fails too and its remaining flows are cancelled.
        </Alert>
      )}
      <label className="mt-3 flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
        Reason<span className="sr-only"> (required)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          aria-invalid={!!error}
          className="rounded-md border border-line-strong bg-surface-2 px-2.5 py-2 text-sm text-fg focus:border-accent focus:outline-none aria-[invalid=true]:border-negative"
          placeholder="e.g. Counterparty did not deliver funds"
        />
      </label>
      {error && <p className="mt-1.5 text-xs text-negative">{error}</p>}
    </Dialog>
  );
}

export function CashFlowDetail({ id, nav }: { id: string; nav: PanelNav }) {
  const can = useCan();
  const toast = useToast();
  const q = useQuery({ queryKey: ["cash-flows", "detail", id], queryFn: () => cashFlowsApi.get(id) });
  const cancel = useWrite((f: CashFlow) => cashFlowsApi.cancel(f.id, f.version), "cash-flows");
  const remove = useWrite((f: CashFlow) => cashFlowsApi.remove(f.id, f.version));
  const [dialog, setDialog] = useState<"settle" | "fail" | "cancel" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const f = q.data;

  const run = async (kind: "cancel" | "delete") => {
    if (!f) return;
    setError(null);
    try {
      if (kind === "cancel") await cancel.mutateAsync(f);
      else await remove.mutateAsync(f);
      toast.show({ tone: "positive", title: `${f.transaction_reference} ${kind === "cancel" ? "cancelled" : "deleted"}` });
      setDialog(null);
      if (kind === "delete") nav.close();
    } catch (e) {
      setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server.");
    }
  };

  const actions = f && can.analyst && (
    <>
      {f.actions.settle && (
        <Button size="sm" variant="primary" icon={<CheckCircle2 />} onClick={() => setDialog("settle")}>
          Settle
        </Button>
      )}
      {(f.actions.fail || f.actions.edit || f.actions.cancel || (can.admin && f.actions.delete)) && (
        <Menu
          label="More actions"
          trigger={(p) => (
            <IconButton label="More actions" {...p}>
              <MoreHorizontal />
            </IconButton>
          )}
          items={[
            ...(f.actions.edit ? [{ label: "Edit", icon: <Pencil />, onSelect: nav.edit }] : []),
            ...(f.actions.fail ? [{ label: "Mark as failed", icon: <XCircle />, onSelect: () => setDialog("fail") }] : []),
            ...(f.actions.cancel ? [{ label: "Cancel flow", icon: <Ban />, onSelect: () => setDialog("cancel") }] : []),
            ...(can.admin && f.actions.delete ? [{ label: "Delete permanently", icon: <Trash2 />, tone: "danger" as const, onSelect: () => setDialog("delete") }] : []),
          ]}
        />
      )}
    </>
  );

  return (
    <>
      <Drawer
        open
        onClose={nav.close}
        title={<span className="font-mono">{f?.transaction_reference ?? (q.isError ? "Cash flow" : "Loading…")}</span>}
        subtitle={
          f && (
            <span className="flex flex-wrap items-center gap-2">
              <FlowDirection direction={f.direction} /> · {CF_CATEGORY_LABEL[f.category]} · {CF_SOURCE_LABEL[f.source]}
              <CashFlowStatusBadge status={f.status} overdue={f.overdue} />
            </span>
          )
        }
        headerActions={actions}
      >
        {q.isPending ? (
          <DetailSkeleton />
        ) : q.isError ? (
          <div className="p-5">
            <Alert tone="negative" title="Couldn't load this cash flow">{q.error.message}</Alert>
          </div>
        ) : (
          f && (
            <>
              {f.overdue && (
                <div className="px-5 pt-4">
                  <Alert tone="warning" title={f.direction === "IN" ? "Overdue inflow: excluded from projections" : "Overdue outflow: counted on day 1"}>
                    {f.direction === "IN"
                      ? "It was expected but hasn't arrived, so projections conservatively leave it out (§5.4). Settle it when it arrives."
                      : "It is still owed, so projections count it on the first projected day (§5.4)."}
                  </Alert>
                </div>
              )}
              {f.note && (
                <div className="px-5 pt-4">
                  <Alert tone={f.status === "FAILED" ? "negative" : "info"} title={f.status === "FAILED" ? "Failure reason" : "Settlement note"}>
                    {f.note}
                  </Alert>
                </div>
              )}
              <DetailSection title="Amounts">
                <div className="grid grid-cols-2 gap-2">
                  <MetricTile label="Expected" sub={formatDate(f.expected_date)}>
                    <Money value={f.amount} currency={f.currency_code} colored={false} tabular={false} />
                  </MetricTile>
                  <MetricTile label={f.status === "SETTLED" ? "Settled" : "Settlement"} sub={f.actual_date ? formatDate(f.actual_date) : "Not settled"}>
                    {f.settled_amount ? <Money value={f.settled_amount} currency={f.currency_code} colored={false} tabular={false} /> : <span className="text-fg-faint">–</span>}
                  </MetricTile>
                </div>
              </DetailSection>
              <DetailSection title="Links">
                <KeyValueList
                  rows={[
                    ["Deal", f.deal_id ? <Link key="d" to={`/data/deals?id=${f.deal_id}&scope=all`} className="font-mono text-accent hover:text-accent-strong">{f.deal_reference}</Link> : "–"],
                    ["Counterparty", f.counterparty_id ? <Link key="c" to={`/data/counterparties?id=${f.counterparty_id}`} className="text-accent hover:text-accent-strong">{f.counterparty_name}</Link> : "–"],
                    ["USD equivalent", <Money key="b" value={f.amount_base} currency="USD" colored={false} />],
                  ]}
                />
                {f.source === "DEAL_SCHEDULE" && f.status === "PROJECTED" && (
                  <p className="mt-3 text-xs text-fg-faint">Scheduled by its deal: amend the deal to change the amount or date.</p>
                )}
              </DetailSection>
              <RecordSection record={f} extra={[["Reference", <span key="r" className="font-mono text-xs">{f.transaction_reference}</span>]]} />
            </>
          )
        )}
      </Drawer>

      {f && dialog === "settle" && (
        <SettleDialog
          flow={f}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.show({ tone: "positive", title: `${f.transaction_reference} settled`, detail: `${f.currency_code} cash balance and projections updated.` });
          }}
        />
      )}
      {f && dialog === "fail" && (
        <FailDialog
          flow={f}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast.show({ tone: "positive", title: `${f.transaction_reference} marked as failed` });
          }}
        />
      )}
      <ConfirmDialog
        open={dialog === "cancel" || dialog === "delete"}
        tone="danger"
        title={dialog === "cancel" ? `Cancel ${f?.transaction_reference ?? ""}?` : `Delete ${f?.transaction_reference ?? ""} permanently?`}
        body={
          <>
            {dialog === "cancel" ? "It leaves the projections and stays in the history as cancelled." : "The manual flow is removed. This is recorded in the audit log."}
            {error && <Alert tone="negative" title="Couldn't complete that" className="mt-3">{error}</Alert>}
          </>
        }
        confirmLabel={dialog === "cancel" ? "Cancel flow" : "Delete"}
        busy={cancel.isPending || remove.isPending}
        onCancel={() => {
          setDialog(null);
          setError(null);
        }}
        onConfirm={() => void run(dialog === "cancel" ? "cancel" : "delete")}
      />
    </>
  );
}
