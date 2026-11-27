import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { z } from "zod";
import { Landmark, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { fundingApi, type FundingFilters, type FundingInput, type FundingListItem, type FundingSource } from "@/api/funding";
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
import { Alert, Badge, Button, ConfirmDialog, Drawer, Field, IconButton, Input, Menu, Money, MoneyInput, Select, Skeleton, useToast, type Tone } from "@/components/ui";
import { shiftDays } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { isDecimal } from "@/lib/decimal";
import { formatCompact, formatDate, formatPercent } from "@/lib/format";
import { CURRENCY_LIST, CURRENCY_NAME, FUNDING_TYPES, FUNDING_TYPE_LABEL, isDepositPool, type FundingType } from "@/mocks/reference";
import { CounterpartyOptions, useCan, useCounterpartyOptions, useWrite } from "../data-shared/shared";

const col = createColumnHelper<FundingListItem>();

const TREATMENT: Record<FundingListItem["liquidity_treatment"], { label: string; tone: Tone; explain: string }> = {
  FUNDING: { label: "Funding", tone: "neutral", explain: "A deposit pool: it funds the balance sheet. It has no headroom and no single provider, so it is excluded from counterparty concentration (§5.10)." },
  HEADROOM_IF_INCLUDED: {
    label: "If included",
    tone: "accent",
    explain: "Committed headroom counts towards opening liquidity only when 'include committed facilities' is switched on. It is off by default, because lines may not be honoured in stress (§5.5).",
  },
  MEMO: { label: "Memo only", tone: "caution", explain: "Uncommitted lines, repo and central bank facilities never count towards opening liquidity. They are shown as memo capacity (§5.5)." },
};

function Utilisation({ value }: { value: string | null }) {
  if (value === null) return <span className="text-fg-faint">–</span>;
  const pct = Number(value) * 100;
  return (
    <span className="flex items-center justify-end gap-2" title={`${pct.toFixed(1)}% drawn`}>
      <span className="relative h-1.5 w-16 rounded-full bg-surface-3" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", pct >= 90 ? "bg-warning" : "bg-accent")} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="num w-11 text-right text-xs">{pct.toFixed(0)}%</span>
    </span>
  );
}

function SummaryStrip({ params }: { params: ListParams }) {
  const q = useQuery({ queryKey: ["funding", "summary", { ...params, page: undefined, page_size: undefined, sort: undefined }], queryFn: () => fundingApi.summary(params as FundingFilters), placeholderData: keepPreviousData });
  const s = q.data;
  if (!s) return <Skeleton className="mb-4 h-[74px] w-full rounded-lg" />;
  const cell = (label: string, value: React.ReactNode, sub: string) => (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="truncate text-base font-semibold text-fg">{value}</div>
      <div className="truncate text-xs text-fg-faint">{sub}</div>
    </div>
  );
  const ccy = s.base_currency;
  return (
    <div className="mb-4 grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1 md:grid-cols-4 md:divide-y-0" aria-label="Funding summary">
      {cell("Total funding", <Money value={s.total_funding} currency={ccy} compact tabular={false} />, `${s.sources} sources, USD equivalent`)}
      {cell("Deposits", formatPercent(s.deposit_share, { dp: 1 }), `${formatCompact(s.deposits)} ${ccy} granular funding`)}
      {cell("Committed headroom", <Money value={s.committed_headroom} currency={ccy} compact tabular={false} />, "Excluded from liquidity by default")}
      {cell("Memo capacity", <Money value={s.memo_capacity} currency={ccy} compact tabular={false} />, "Uncommitted, repo and central bank")}
    </div>
  );
}

/* ---------- detail ---------- */

function FundingDetail({ id, nav }: { id: string; nav: PanelNav }) {
  const can = useCan();
  const toast = useToast();
  const q = useQuery({ queryKey: ["funding", "detail", id], queryFn: () => fundingApi.get(id) });
  const remove = useWrite((f: FundingSource) => fundingApi.remove(f.id, f.version));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = q.data;
  const t = f ? TREATMENT[f.liquidity_treatment] : null;
  return (
    <>
      <Drawer
        open
        onClose={nav.close}
        title={f?.name ?? "Funding source"}
        subtitle={f && <span className="flex items-center gap-1.5">{FUNDING_TYPE_LABEL[f.funding_type]} · {f.currency_code} <Badge tone={t!.tone}>{t!.label}</Badge></span>}
        headerActions={
          f &&
          can.analyst && (
            <>
              <Button size="sm" icon={<Pencil />} onClick={nav.edit}>
                Edit
              </Button>
              {can.admin && (
                <Menu
                  label="More actions"
                  trigger={(p) => (
                    <IconButton label="More actions" {...p}>
                      <MoreHorizontal />
                    </IconButton>
                  )}
                  items={[{ label: "Delete permanently", icon: <Trash2 />, tone: "danger", onSelect: () => setConfirm(true) }]}
                />
              )}
            </>
          )
        }
      >
        {q.isPending ? (
          <DetailSkeleton />
        ) : q.isError ? (
          <div className="p-5"><Alert tone="negative" title="Couldn't load this funding source">{q.error.message}</Alert></div>
        ) : (
          f && (
            <>
              <DetailSection title="Amounts">
                {isDepositPool(f.funding_type) ? (
                  <MetricTile label="Balance">
                    <Money value={f.utilized_amount} currency={f.currency_code} tabular={false} />
                  </MetricTile>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    <MetricTile label="Limit"><Money value={f.available_amount} currency={f.currency_code} compact tabular={false} /></MetricTile>
                    <MetricTile label="Drawn" sub={f.utilization ? `${formatPercent(f.utilization, { dp: 1 })} used` : undefined}>
                      <Money value={f.utilized_amount} currency={f.currency_code} compact tabular={false} />
                    </MetricTile>
                    <MetricTile label="Headroom"><Money value={f.headroom!} currency={f.currency_code} compact tabular={false} /></MetricTile>
                  </div>
                )}
              </DetailSection>
              <DetailSection title="In liquidity">
                <p className="text-sm text-fg-muted">{t!.explain}</p>
              </DetailSection>
              <DetailSection title="Details">
                <KeyValueList
                  rows={[
                    ["Provider", f.counterparty_id ? <Link key="p" to={`/data/counterparties?id=${f.counterparty_id}`} className="text-accent hover:text-accent-strong">{f.counterparty_name}</Link> : isDepositPool(f.funding_type) ? "Many depositors (granular)" : "–"],
                    ["Currency", `${f.currency_code} · ${CURRENCY_NAME[f.currency_code]}`],
                    ["Maturity", f.maturity_date ? formatDate(f.maturity_date) : "Open-ended"],
                  ]}
                />
              </DetailSection>
              <RecordSection record={f} />
            </>
          )
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title={`Delete ${f?.name ?? "funding source"}?`}
        body={<>It is removed from funding and concentration figures. Recorded in the audit log.{error && <Alert tone="negative" title="Couldn't delete" className="mt-3">{error}</Alert>}</>}
        confirmLabel="Delete"
        busy={remove.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          void remove
            .mutateAsync(f!)
            .then(() => {
              toast.show({ tone: "positive", title: `${f!.name} deleted` });
              nav.close();
            })
            .catch((e) => setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server."))
        }
      />
    </>
  );
}

/* ---------- editor ---------- */

const FIELDS = ["name", "funding_type", "currency_code", "counterparty_id", "available_amount", "utilized_amount", "maturity_date"] as const;
const LINES: FundingType[] = ["COMMITTED_LINE", "UNCOMMITTED_LINE", "REPO_FACILITY"];

const schema = z
  .object({
    name: z.string().trim().min(2, { error: "Enter at least 2 characters" }).max(120, { error: "Keep it under 120 characters" }),
    funding_type: z.enum(FUNDING_TYPES),
    currency_code: z.enum(CURRENCY_LIST),
    counterparty_id: z.string(),
    available_amount: z.string().refine((v) => isDecimal(v) && Number(v) >= 0, { error: "Enter an amount of zero or more" }),
    utilized_amount: z.string(),
    maturity_date: z.string(),
  })
  .superRefine((v, ctx) => {
    if (isDepositPool(v.funding_type)) return;
    if (!isDecimal(v.utilized_amount) || Number(v.utilized_amount) < 0) ctx.addIssue({ code: "custom", path: ["utilized_amount"], message: "Enter the drawn amount (zero or more)" });
    else if (isDecimal(v.available_amount) && Number(v.utilized_amount) > Number(v.available_amount)) ctx.addIssue({ code: "custom", path: ["utilized_amount"], message: "Drawn can't exceed the limit" });
    if (LINES.includes(v.funding_type) && !v.counterparty_id) ctx.addIssue({ code: "custom", path: ["counterparty_id"], message: "Choose the provider of this line" });
  });
type FormValues = z.infer<typeof schema>;

function FundingEditor({ id, nav }: { id: string | null; nav: PanelNav }) {
  const formId = useId();
  const toast = useToast();
  const { system } = useSession();
  const cps = useCounterpartyOptions();
  const entity = useQuery({ queryKey: ["funding", "detail", id], queryFn: () => fundingApi.get(id!), enabled: id !== null });
  const create = useWrite((i: FundingInput) => fundingApi.create(i), "funding");
  const update = useWrite(({ id: fid, patch }: { id: string; patch: Partial<FundingInput> & { version: number } }) => fundingApi.update(fid, patch), "funding");
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const e = entity.data;
  const toValues = (x: FundingSource): FormValues => ({
    name: x.name,
    funding_type: x.funding_type,
    currency_code: x.currency_code,
    counterparty_id: x.counterparty_id ?? "",
    available_amount: x.available_amount,
    utilized_amount: x.utilized_amount,
    maturity_date: x.maturity_date ?? "",
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    values: e ? toValues(e) : undefined,
    defaultValues: { name: "", funding_type: "COMMITTED_LINE", currency_code: "USD", counterparty_id: "", available_amount: "", utilized_amount: "0", maturity_date: "" },
    resetOptions: { keepDirtyValues: true },
  });
  const { register, control, handleSubmit, formState, setError, watch } = form;
  const { errors } = formState;
  useReportDirty(formState.isDirty, setDirty);
  const type = watch("funding_type");
  const ccy = watch("currency_code");
  const deposit = isDepositPool(type);
  const avail = watch("available_amount");
  const used = watch("utilized_amount");
  const headroom = !deposit && isDecimal(avail) && isDecimal(used) ? Number(avail) - Number(used) : null;
  useEffect(() => setBanner(null), [type]);

  const submit = handleSubmit(async (v) => {
    setBanner(null);
    const input: FundingInput = { ...v, counterparty_id: deposit ? null : v.counterparty_id || null, utilized_amount: deposit ? v.available_amount : v.utilized_amount, maturity_date: v.maturity_date || null };
    try {
      let saved: FundingSource;
      if (!e) saved = await create.mutateAsync(input);
      else {
        const patch: Partial<FundingInput> = {};
        for (const k of FIELDS) if (input[k] !== (e[k] ?? null)) (patch as Record<string, unknown>)[k] = input[k];
        saved = Object.keys(patch).length ? await update.mutateAsync({ id: e.id, patch: { ...patch, version: e.version } }) : e;
      }
      setDirty(false);
      toast.show({ tone: "positive", title: e ? "Changes saved" : `${saved.name} added` });
      if (e) nav.closeEditor();
      else nav.view(saved.id);
    } catch (err) {
      setBanner(applyServerErrors(err, setError, FIELDS));
    }
  });

  return (
    <EditorDrawer
      noun="funding source"
      title={id ? `Edit ${e?.name ?? "funding source"}` : "New funding source"}
      formId={formId}
      isNew={id === null}
      dirty={dirty}
      saving={create.isPending || update.isPending}
      loading={id !== null && entity.isPending}
      loadError={entity.isError ? entity.error.message : null}
      submitLabel={id ? "Save changes" : "Add funding source"}
      onClose={nav.closeEditor}
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5">
        <FormBanner
          banner={banner}
          onReloadLatest={() =>
            void entity.refetch().then((r) => {
              if (r.data) form.reset(toValues(r.data), { keepDirtyValues: false });
              setBanner(null);
              toast.show({ tone: "info", title: "Loaded the latest version" });
            })
          }
        />
        <Field label="Name" required error={errors.name?.message}>
          {(p) => <Input {...p} {...register("name")} placeholder="e.g. Northbridge revolving facility" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" required error={errors.funding_type?.message}>
            {(p) => (
              <Select {...p} {...register("funding_type")}>
                <optgroup label="Deposits">
                  {FUNDING_TYPES.filter(isDepositPool).map((t) => <option key={t} value={t}>{FUNDING_TYPE_LABEL[t]}</option>)}
                </optgroup>
                <optgroup label="Lines and facilities">
                  {FUNDING_TYPES.filter((t) => !isDepositPool(t)).map((t) => <option key={t} value={t}>{FUNDING_TYPE_LABEL[t]}</option>)}
                </optgroup>
              </Select>
            )}
          </Field>
          <Field label="Currency" required error={errors.currency_code?.message}>
            {(p) => (
              <Select {...p} {...register("currency_code")}>
                {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} · {CURRENCY_NAME[c]}</option>)}
              </Select>
            )}
          </Field>
        </div>
        {deposit ? (
          <>
            <Alert tone="info" title="Deposit pool">
              A pool of many depositors: there is no single provider and no headroom, so its balance is both available and utilised (A3).
            </Alert>
            <Field label="Balance" required error={errors.available_amount?.message}>
              {(p) => <Controller control={control} name="available_amount" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={ccy} />} />}
            </Field>
          </>
        ) : (
          <>
            <Field label="Provider" required={LINES.includes(type)} error={errors.counterparty_id?.message} hint={LINES.includes(type) ? undefined : "Optional for central bank facilities"}>
              {(p) => (
                <Select {...p} {...register("counterparty_id")}>
                  <option value="">{LINES.includes(type) ? "Choose the provider" : "None"}</option>
                  <CounterpartyOptions groups={cps.groups} />
                </Select>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Limit" required error={errors.available_amount?.message}>
                {(p) => <Controller control={control} name="available_amount" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={ccy} />} />}
              </Field>
              <Field
                label="Drawn"
                required
                error={errors.utilized_amount?.message}
                hint={headroom !== null && headroom >= 0 ? `Headroom ${headroom.toLocaleString("en", { minimumFractionDigits: ccy === "JPY" ? 0 : 2, maximumFractionDigits: ccy === "JPY" ? 0 : 2 })} ${ccy}` : undefined}
              >
                {(p) => <Controller control={control} name="utilized_amount" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={ccy} />} />}
              </Field>
            </div>
            <p className="text-xs text-fg-faint">{TREATMENT[type === "COMMITTED_LINE" ? "HEADROOM_IF_INCLUDED" : "MEMO"].explain}</p>
          </>
        )}
        <Field label="Maturity date" error={errors.maturity_date?.message} hint="Leave empty for open-ended funding">
          {(p) => <Input {...p} type="date" min={shiftDays(system.businessDate, 1)} {...register("maturity_date")} className="w-48" />}
        </Field>
      </form>
    </EditorDrawer>
  );
}

/* ---------- page ---------- */

export function FundingSourcesPage() {
  const can = useCan();
  const columns = useCallback(
    (open: (id: string) => void) => [
      col.accessor("name", {
        header: "Name",
        cell: ({ row }) => (
          <button type="button" onClick={() => open(row.original.id)} className="max-w-64 truncate rounded-sm text-left font-medium text-fg hover:text-accent-strong hover:underline">
            {row.original.name}
          </button>
        ),
      }),
      col.accessor("funding_type", { header: "Type", cell: (c) => <span className="text-fg-muted">{FUNDING_TYPE_LABEL[c.getValue()]}</span> }),
      col.accessor("counterparty_name", {
        id: "provider",
        header: "Provider",
        enableSorting: false,
        cell: ({ row }) => <span className="block max-w-48 truncate text-fg-muted">{row.original.counterparty_name ?? (isDepositPool(row.original.funding_type) ? "Granular" : "–")}</span>,
        meta: { hideBelow: "2xl" },
      }),
      col.accessor("available_amount", { header: "Limit / balance", cell: ({ row }) => <Money value={row.original.available_amount} currency={row.original.currency_code} />, meta: { numeric: true, hint: "Sorted by USD equivalent" } }),
      col.accessor("utilized_amount", {
        header: "Drawn",
        cell: ({ row }) => (isDepositPool(row.original.funding_type) ? <span className="text-fg-faint">–</span> : <Money value={row.original.utilized_amount} currency={row.original.currency_code} hideCurrency />),
        meta: { numeric: true, hideBelow: "lg" },
      }),
      col.accessor("utilization", { header: "Used", enableSorting: false, cell: (c) => <Utilisation value={c.getValue()} />, meta: { numeric: true, hideBelow: "md" } }),
      col.accessor("liquidity_treatment", { header: "In liquidity", enableSorting: false, cell: (c) => <Badge tone={TREATMENT[c.getValue()].tone}>{TREATMENT[c.getValue()].label}</Badge> }),
      col.accessor("maturity_date", { header: "Maturity", cell: (c) => <span className="num text-fg-muted">{c.getValue() ? formatDate(c.getValue()!) : "Open"}</span>, meta: { hideBelow: "2xl" } }),
    ],
    [],
  );
  return (
    <ResourceListPage<FundingListItem>
      title="Funding Sources"
      description="Deposit pools and credit facilities. Deposits fund the balance sheet; line headroom counts in liquidity only as configured."
      noun={["funding source", "funding sources"]}
      searchPlaceholder="Search name or provider"
      defaultSort="funding_type,name"
      filters={[
        { kind: "multi", key: "funding_type", label: "Type", options: FUNDING_TYPES.map((t) => ({ value: t, label: FUNDING_TYPE_LABEL[t] })) },
        { kind: "multi", key: "currency_code", label: "Currency", options: CURRENCY_LIST.map((c) => ({ value: c, label: c })) },
      ]}
      columns={columns}
      rowId={(r) => r.id}
      listQuery={(p) => ({ queryKey: ["funding", "list", p], queryFn: () => fundingApi.list(p as FundingFilters) })}
      exportCsv={(p) => fundingApi.exportCsv(p as FundingFilters)}
      summary={(p) => <SummaryStrip params={p} />}
      canCreate={can.analyst}
      canEdit={can.analyst}
      renderDetail={(id, nav) => <FundingDetail id={id} nav={nav} />}
      renderEditor={(id, nav) => <FundingEditor id={id} nav={nav} />}
      empty={{ icon: <Landmark />, title: "No funding sources", description: "Add deposit pools and credit lines to see the funding mix." }}
    />
  );
}
