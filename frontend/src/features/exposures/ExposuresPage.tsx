import { useCallback, useId, useState } from "react";
import { Link } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { z } from "zod";
import { Coins, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { exposuresApi, type Exposure, type ExposureFilters, type ExposureInput, type ExposureItem } from "@/api/exposures";
import { isApiError } from "@/api/problem";
import { useSession } from "@/app/session";
import {
  applyServerErrors,
  DetailSection,
  DetailSkeleton,
  EditorDrawer,
  FormBanner,
  KeyValueList,
  MetricTile,
  RecordSection,
  ResourceListPage,
  useReportDirty,
  type Banner,
  type ListParams,
  type PanelNav,
} from "@/components/data";
import { Alert, Badge, Button, ConfirmDialog, Drawer, Field, IconButton, Input, Menu, Money, MoneyInput, SegmentedControl, Select, Skeleton, useToast } from "@/components/ui";
import { shiftDays } from "@/lib/calendar";
import { isDecimal } from "@/lib/decimal";
import { formatCompact, formatDate } from "@/lib/format";
import { CURRENCY_LIST, CURRENCY_NAME, EXPOSURE_TYPES, EXPOSURE_TYPE_LABEL } from "@/mocks/reference";
import { CounterpartyOptions, useCan, useCounterpartyOptions, useWrite } from "../data-shared/shared";

const col = createColumnHelper<ExposureItem>();
const NON_BASE = CURRENCY_LIST.filter((c) => c !== "USD");

function PositionBadge({ position }: { position: "LONG" | "SHORT" }) {
  return <Badge tone={position === "LONG" ? "accent" : "neutral"}>{position === "LONG" ? "Long" : "Short"}</Badge>;
}

/** Net manual position per currency: diverging bars, long right (blue), short left (orange), with signed labels. */
function SummaryStrip({ params }: { params: ListParams }) {
  const q = useQuery({ queryKey: ["exposures", "summary", { ...params, page: undefined, page_size: undefined, sort: undefined }], queryFn: () => exposuresApi.summary(params as ExposureFilters), placeholderData: keepPreviousData });
  const s = q.data;
  if (!s) return <Skeleton className="mb-4 h-32 w-full rounded-lg" />;
  const max = Math.max(1, ...s.items.map((i) => Math.abs(Number(i.net_base))));
  return (
    <section className="mb-4 rounded-lg border border-line bg-surface-1 px-4 py-3" aria-label="Net manual position by currency">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Net manual position by currency</h2>
        <span className="text-xs text-fg-faint">
          USD equivalent · gross {formatCompact(s.gross_base)} · net {formatCompact(s.net_base)} ·{" "}
          <Link to="/liquidity/concentration" className="text-accent hover:text-accent-strong">Full net open position</Link>
        </span>
      </div>
      {s.items.length === 0 ? (
        <p className="py-3 text-sm text-fg-faint">No positions match these filters.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {s.items.map((i) => {
            const v = Number(i.net_base);
            const w = (Math.abs(v) / max) * 50;
            return (
              <li key={i.currency_code} className="grid grid-cols-[3rem_1fr_6rem] items-center gap-3 text-xs" title={`${i.currency_code}: long ${i.long}, short ${i.short}, net ${i.net}`}>
                <span className="font-mono text-fg">{i.currency_code}</span>
                <span className="relative h-2.5">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" aria-hidden />
                  <span
                    className="absolute inset-y-0 rounded-[3px]"
                    style={{ background: v >= 0 ? "var(--color-series-in)" : "var(--color-series-out)", left: v >= 0 ? "50%" : `${50 - w}%`, width: `${Math.max(0.5, w)}%` }}
                    aria-hidden
                  />
                </span>
                <span className="num text-right text-fg">
                  {v >= 0 ? "+" : "−"}
                  {formatCompact(String(Math.abs(v)))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-2xs text-fg-faint">Manual positions only. The net open position (§5.11) also includes deals, cash, securities and funding.</p>
    </section>
  );
}

function ExposureDetail({ id, nav }: { id: string; nav: PanelNav }) {
  const can = useCan();
  const toast = useToast();
  const q = useQuery({ queryKey: ["exposures", "detail", id], queryFn: () => exposuresApi.get(id) });
  const remove = useWrite((x: Exposure) => exposuresApi.remove(x.id, x.version));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const x = q.data;
  return (
    <>
      <Drawer
        open
        onClose={nav.close}
        title={x ? `${x.position === "LONG" ? "Long" : "Short"} ${x.currency_code} · ${EXPOSURE_TYPE_LABEL[x.exposure_type]}` : "Exposure"}
        subtitle={x?.description}
        headerActions={
          x &&
          can.analyst && (
            <>
              <Button size="sm" icon={<Pencil />} onClick={nav.edit}>Edit</Button>
              <Menu
                label="More actions"
                trigger={(p) => (
                  <IconButton label="More actions" {...p}>
                    <MoreHorizontal />
                  </IconButton>
                )}
                items={[{ label: "Close position (delete)", icon: <Trash2 />, tone: "danger", onSelect: () => setConfirm(true) }]}
              />
            </>
          )
        }
      >
        {q.isPending ? (
          <DetailSkeleton />
        ) : q.isError ? (
          <div className="p-5"><Alert tone="negative" title="Couldn't load this exposure">{q.error.message}</Alert></div>
        ) : (
          x && (
            <>
              <DetailSection title="Position">
                <div className="grid grid-cols-3 gap-2">
                  <MetricTile label="Amount"><Money value={x.exposure_amount} currency={x.currency_code} compact tabular={false} /></MetricTile>
                  <MetricTile label="Rate" sub="USD per unit, at the business date">{Number(x.rate).toFixed(x.currency_code === "JPY" ? 6 : 4)}</MetricTile>
                  <MetricTile label="USD equivalent" sub="Long +, short −"><Money value={x.base_equivalent} currency="USD" compact sign="always" colored={false} tabular={false} /></MetricTile>
                </div>
                <p className="mt-3 text-xs text-fg-faint">The rate and USD equivalent are computed when read, never stored (A2).</p>
              </DetailSection>
              <DetailSection title="Details">
                <KeyValueList
                  rows={[
                    ["Value date", x.value_date ? formatDate(x.value_date) : "None"],
                    ["Counterparty", x.counterparty_id ? <Link key="c" to={`/data/counterparties?id=${x.counterparty_id}`} className="text-accent hover:text-accent-strong">{x.counterparty_name}</Link> : "–"],
                    ["Description", x.description],
                  ]}
                />
              </DetailSection>
              <RecordSection record={x} />
            </>
          )
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title="Close this position?"
        body={<>The manual position is deleted. Recorded in the audit log.{error && <Alert tone="negative" title="Couldn't delete" className="mt-3">{error}</Alert>}</>}
        confirmLabel="Close position"
        busy={remove.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          void remove
            .mutateAsync(x!)
            .then(() => {
              toast.show({ tone: "positive", title: "Position closed" });
              nav.close();
            })
            .catch((e) => setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server."))
        }
      />
    </>
  );
}

const FIELDS = ["currency_code", "exposure_type", "position", "exposure_amount", "value_date", "counterparty_id", "description"] as const;

function ExposureEditor({ id, nav }: { id: string | null; nav: PanelNav }) {
  const formId = useId();
  const toast = useToast();
  const { system } = useSession();
  const t0 = system.businessDate;
  const cps = useCounterpartyOptions();
  const entity = useQuery({ queryKey: ["exposures", "detail", id], queryFn: () => exposuresApi.get(id!), enabled: id !== null });
  const create = useWrite((i: ExposureInput) => exposuresApi.create(i), "exposures");
  const update = useWrite(({ id: xid, patch }: { id: string; patch: Partial<ExposureInput> & { version: number } }) => exposuresApi.update(xid, patch), "exposures");
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const schema = z
    .object({
      currency_code: z.enum(NON_BASE as unknown as [string, ...string[]], { error: "Choose a currency other than USD" }),
      exposure_type: z.enum(EXPOSURE_TYPES),
      position: z.enum(["LONG", "SHORT"]),
      exposure_amount: z.string().refine((v) => isDecimal(v) && Number(v) > 0, { error: "Enter an amount above zero" }),
      value_date: z.string(),
      counterparty_id: z.string(),
      description: z.string().trim().min(3, { error: "Describe the position (at least 3 characters)" }).max(200, { error: "Keep it under 200 characters" }),
    })
    .superRefine((v, ctx) => {
      if ((v.exposure_type === "FX_SPOT" || v.exposure_type === "FX_FORWARD") && !v.value_date) ctx.addIssue({ code: "custom", path: ["value_date"], message: "Spot and forward positions need a value date" });
      if (v.value_date && v.value_date <= t0) ctx.addIssue({ code: "custom", path: ["value_date"], message: "Must be after the business date" });
    });
  type FormValues = z.infer<typeof schema>;
  const e = entity.data;
  const toValues = (x: Exposure): FormValues => ({
    currency_code: x.currency_code,
    exposure_type: x.exposure_type,
    position: x.position,
    exposure_amount: x.exposure_amount,
    value_date: x.value_date ?? "",
    counterparty_id: x.counterparty_id ?? "",
    description: x.description,
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    values: e ? toValues(e) : undefined,
    defaultValues: { currency_code: "EUR", exposure_type: "FX_FORWARD", position: "LONG", exposure_amount: "", value_date: shiftDays(t0, 30), counterparty_id: "", description: "" },
    resetOptions: { keepDirtyValues: true },
  });
  const { register, control, handleSubmit, formState, setError, watch } = form;
  const { errors } = formState;
  useReportDirty(formState.isDirty, setDirty);
  const ccy = watch("currency_code");
  const type = watch("exposure_type");

  const submit = handleSubmit(async (v) => {
    setBanner(null);
    const input = { ...v, value_date: v.value_date || null, counterparty_id: v.counterparty_id || null } as ExposureInput;
    try {
      let saved: Exposure;
      if (!e) saved = await create.mutateAsync(input);
      else {
        const patch: Partial<ExposureInput> = {};
        for (const k of FIELDS) if (input[k] !== (e[k] ?? null)) (patch as Record<string, unknown>)[k] = input[k];
        saved = Object.keys(patch).length ? await update.mutateAsync({ id: e.id, patch: { ...patch, version: e.version } }) : e;
      }
      setDirty(false);
      toast.show({ tone: "positive", title: e ? "Changes saved" : "Position added" });
      if (e) nav.closeEditor();
      else nav.view(saved.id);
    } catch (err) {
      setBanner(applyServerErrors(err, setError, FIELDS));
    }
  });

  return (
    <EditorDrawer
      noun="exposure"
      title={id ? "Edit position" : "New currency position"}
      formId={formId}
      isNew={id === null}
      dirty={dirty}
      saving={create.isPending || update.isPending}
      loading={id !== null && entity.isPending}
      loadError={entity.isError ? entity.error.message : null}
      submitLabel={id ? "Save changes" : "Add position"}
      onClose={nav.closeEditor}
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5">
        <FormBanner banner={banner} onReloadLatest={() => void entity.refetch().then((r) => { if (r.data) form.reset(toValues(r.data), { keepDirtyValues: false }); setBanner(null); })} />
        <p className="text-xs text-fg-muted">Only positions not captured elsewhere: FX spots and forwards, off-balance-sheet items. Deals, cash, securities and funding already count (A2).</p>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Position<span className="ml-0.5 text-negative" aria-hidden>*</span></span>
          <Controller control={control} name="position" render={({ field }) => <SegmentedControl label="Position" value={field.value} onChange={field.onChange} options={[{ value: "LONG", label: "Long (asset)" }, { value: "SHORT", label: "Short (liability)" }]} />} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" required error={errors.currency_code?.message} hint="USD is the base currency and carries no FX exposure">
            {(p) => (
              <Select {...p} {...register("currency_code")}>
                {NON_BASE.map((c) => <option key={c} value={c}>{c} · {CURRENCY_NAME[c]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Type" required error={errors.exposure_type?.message}>
            {(p) => (
              <Select {...p} {...register("exposure_type")}>
                {EXPOSURE_TYPES.map((t) => <option key={t} value={t}>{EXPOSURE_TYPE_LABEL[t]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Amount" required error={errors.exposure_amount?.message}>
            {(p) => <Controller control={control} name="exposure_amount" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={ccy} />} />}
          </Field>
          <Field label="Value date" required={type === "FX_SPOT" || type === "FX_FORWARD"} error={errors.value_date?.message}>
            {(p) => <Input {...p} type="date" min={shiftDays(t0, 1)} {...register("value_date")} />}
          </Field>
          <Field label="Counterparty" error={errors.counterparty_id?.message} hint="Optional" className="sm:col-span-2">
            {(p) => (
              <Select {...p} {...register("counterparty_id")}>
                <option value="">None</option>
                <CounterpartyOptions groups={cps.groups} />
              </Select>
            )}
          </Field>
        </div>
        <Field label="Description" required error={errors.description?.message}>
          {(p) => <Input {...p} {...register("description")} placeholder="e.g. Buy EUR forward against USD" />}
        </Field>
      </form>
    </EditorDrawer>
  );
}

export function ExposuresPage() {
  const can = useCan();
  const columns = useCallback(
    (open: (id: string) => void) => [
      col.accessor("currency_code", {
        header: "Currency",
        cell: ({ row }) => (
          <button type="button" onClick={() => open(row.original.id)} className="rounded-sm font-mono text-xs font-medium text-accent-strong hover:underline">
            {row.original.currency_code}
          </button>
        ),
      }),
      col.accessor("position", { header: "Position", cell: (c) => <PositionBadge position={c.getValue()} /> }),
      col.accessor("exposure_type", { header: "Type", cell: (c) => <span className="text-fg-muted">{EXPOSURE_TYPE_LABEL[c.getValue()]}</span> }),
      col.accessor("exposure_amount", { header: "Amount", cell: ({ row }) => <Money value={row.original.exposure_amount} currency={row.original.currency_code} />, meta: { numeric: true } }),
      col.accessor("base_equivalent", { header: "USD equivalent", cell: (c) => <Money value={c.getValue()} currency="USD" compact hideCurrency sign="always" colored={false} />, meta: { numeric: true, hint: "Long +, short −, at the business-date rate" } }),
      col.accessor("value_date", { header: "Value date", cell: (c) => <span className="num text-fg-muted">{c.getValue() ? formatDate(c.getValue()!) : "–"}</span>, meta: { hideBelow: "lg" } }),
      col.accessor("description", { header: "Description", enableSorting: false, cell: (c) => <span className="block max-w-72 truncate text-fg-muted">{c.getValue()}</span>, meta: { hideBelow: "xl" } }),
    ],
    [],
  );
  return (
    <ResourceListPage<ExposureItem>
      title="Currency Exposures"
      description="FX positions not captured by deals, cash, securities or funding. Rates and USD equivalents are computed when read."
      noun={["position", "positions"]}
      searchPlaceholder="Search description or counterparty"
      defaultSort="currency_code,value_date"
      filters={[
        { kind: "multi", key: "currency_code", label: "Currency", options: NON_BASE.map((c) => ({ value: c, label: c })) },
        { kind: "multi", key: "exposure_type", label: "Type", options: EXPOSURE_TYPES.map((t) => ({ value: t, label: EXPOSURE_TYPE_LABEL[t] })) },
        { kind: "multi", key: "position", label: "Position", options: [{ value: "LONG", label: "Long" }, { value: "SHORT", label: "Short" }] },
      ]}
      columns={columns}
      rowId={(r) => r.id}
      listQuery={(p) => ({ queryKey: ["exposures", "list", p], queryFn: () => exposuresApi.list(p as ExposureFilters) })}
      exportCsv={(p) => exposuresApi.exportCsv(p as ExposureFilters)}
      summary={(p) => <SummaryStrip params={p} />}
      canCreate={can.analyst}
      canEdit={can.analyst}
      createLabel="New position"
      renderDetail={(id, nav) => <ExposureDetail id={id} nav={nav} />}
      renderEditor={(id, nav) => <ExposureEditor id={id} nav={nav} />}
      empty={{ icon: <Coins />, title: "No manual positions", description: "Add FX forwards and off-balance-sheet items that aren't captured elsewhere." }}
    />
  );
}
