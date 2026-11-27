import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { z } from "zod";
import { MoreHorizontal, Pencil, Trash2, Vault } from "lucide-react";
import { liquidAssetsApi, type LiquidAsset, type LiquidAssetFilters, type LiquidAssetInput, type LiquidAssetItem } from "@/api/liquidAssets";
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
import { Alert, Badge, Button, ConfirmDialog, Drawer, Field, IconButton, Input, Menu, Money, MoneyInput, PercentInput, Select, Skeleton, Switch, useToast } from "@/components/ui";
import { shiftDays } from "@/lib/calendar";
import { isDecimal } from "@/lib/decimal";
import { formatDate, formatPercent } from "@/lib/format";
import { ASSET_CLASSES, ASSET_CLASS_LABEL, CURRENCY_LIST, CURRENCY_NAME, DEFAULT_HAIRCUT, type AssetClass } from "@/mocks/reference";
import { CounterpartyOptions, useCan, useCounterpartyOptions, useWrite } from "../data-shared/shared";

const col = createColumnHelper<LiquidAssetItem>();

function SummaryStrip({ params }: { params: ListParams }) {
  const q = useQuery({ queryKey: ["liquid-assets", "summary", { ...params, page: undefined, page_size: undefined, sort: undefined }], queryFn: () => liquidAssetsApi.summary(params as LiquidAssetFilters), placeholderData: keepPreviousData });
  const s = q.data;
  if (!s) return <Skeleton className="mb-4 h-[74px] w-full rounded-lg" />;
  const cell = (label: string, value: React.ReactNode, sub: string) => (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="truncate text-base font-semibold text-fg">{value}</div>
      <div className="truncate text-xs text-fg-faint">{sub}</div>
    </div>
  );
  const c = s.base_currency;
  return (
    <div className="mb-4 grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1 md:grid-cols-4 md:divide-y-0" aria-label="Buffer summary">
      {cell("Liquidity value", <Money value={s.liquidity_value} currency={c} compact tabular={false} />, "Counts in opening liquidity (§5.5)")}
      {cell("Market value", <Money value={s.market_value_unencumbered} currency={c} compact tabular={false} />, "Unencumbered, USD equivalent")}
      {cell("Average haircut", formatPercent(s.weighted_haircut, { dp: 1 }), "Weighted by market value")}
      {cell("Encumbered", <Money value={s.market_value_encumbered} currency={c} compact tabular={false} />, "Pledged or lent: excluded")}
    </div>
  );
}

function AssetDetail({ id, nav }: { id: string; nav: PanelNav }) {
  const can = useCan();
  const toast = useToast();
  const q = useQuery({ queryKey: ["liquid-assets", "detail", id], queryFn: () => liquidAssetsApi.get(id) });
  const remove = useWrite((a: LiquidAsset) => liquidAssetsApi.remove(a.id, a.version));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = q.data;
  return (
    <>
      <Drawer
        open
        onClose={nav.close}
        title={a?.name ?? "Security"}
        subtitle={a && <span className="flex items-center gap-1.5"><span className="font-mono">{a.security_id}</span> · {ASSET_CLASS_LABEL[a.asset_class]}{a.is_encumbered && <Badge tone="caution">Encumbered</Badge>}</span>}
        headerActions={
          a &&
          can.analyst && (
            <>
              <Button size="sm" icon={<Pencil />} onClick={nav.edit}>Edit</Button>
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
          <div className="p-5"><Alert tone="negative" title="Couldn't load this security">{q.error.message}</Alert></div>
        ) : (
          a && (
            <>
              {a.is_encumbered && (
                <div className="px-5 pt-4">
                  <Alert tone="info" title="Encumbered">Pledged or lent, so it can't be sold or repo'd for liquidity. Its liquidity value is zero.</Alert>
                </div>
              )}
              <DetailSection title="Valuation">
                <div className="grid grid-cols-3 gap-2">
                  <MetricTile label="Market value"><Money value={a.market_value} currency={a.currency_code} compact tabular={false} /></MetricTile>
                  <MetricTile label="Haircut" sub="Illustrative, not regulatory">{formatPercent(a.haircut, { dp: 2 })}</MetricTile>
                  <MetricTile label="Liquidity value" sub="MV × (1 − haircut)"><Money value={a.liquidity_value} currency={a.currency_code} compact tabular={false} /></MetricTile>
                </div>
              </DetailSection>
              <DetailSection title="Details">
                <KeyValueList
                  rows={[
                    ["Issuer", a.issuer_counterparty_id ? <Link key="i" to={`/data/counterparties?id=${a.issuer_counterparty_id}`} className="text-accent hover:text-accent-strong">{a.issuer_name}</Link> : "Sovereign or supranational"],
                    ["Currency", `${a.currency_code} · ${CURRENCY_NAME[a.currency_code]}`],
                    ["Maturity", formatDate(a.maturity_date)],
                  ]}
                />
              </DetailSection>
              <RecordSection record={a} />
            </>
          )
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title={`Delete ${a?.security_id ?? "security"}?`}
        body={<>It leaves the buffer and opening liquidity. Recorded in the audit log.{error && <Alert tone="negative" title="Couldn't delete" className="mt-3">{error}</Alert>}</>}
        confirmLabel="Delete"
        busy={remove.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          void remove
            .mutateAsync(a!)
            .then(() => {
              toast.show({ tone: "positive", title: `${a!.security_id} deleted` });
              nav.close();
            })
            .catch((e) => setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server."))
        }
      />
    </>
  );
}

const FIELDS = ["security_id", "name", "asset_class", "currency_code", "issuer_counterparty_id", "market_value", "haircut", "is_encumbered", "maturity_date"] as const;

function schemaFor(t0: string, isNew: boolean) {
  return z.object({
    security_id: isNew
      ? z.string().trim().toUpperCase().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/, { error: "Use 12 characters: 2 letters, 9 letters or digits, 1 check digit" })
      : z.string(),
    name: z.string().trim().min(2, { error: "Enter at least 2 characters" }),
    asset_class: z.enum(ASSET_CLASSES),
    currency_code: z.enum(CURRENCY_LIST),
    issuer_counterparty_id: z.string(),
    market_value: z.string().refine((v) => isDecimal(v) && Number(v) >= 0, { error: "Enter a market value of zero or more" }),
    haircut: z.string().refine((v) => isDecimal(v) && Number(v) >= 0 && Number(v) < 1, { error: "Must be at least 0% and below 100%" }),
    is_encumbered: z.boolean(),
    maturity_date: z.string().refine((v) => v > t0, { error: "Must be after the business date" }),
  });
}
type FormValues = z.infer<ReturnType<typeof schemaFor>>;

function AssetEditor({ id, nav }: { id: string | null; nav: PanelNav }) {
  const formId = useId();
  const toast = useToast();
  const { system } = useSession();
  const cps = useCounterpartyOptions();
  const entity = useQuery({ queryKey: ["liquid-assets", "detail", id], queryFn: () => liquidAssetsApi.get(id!), enabled: id !== null });
  const create = useWrite((i: LiquidAssetInput) => liquidAssetsApi.create(i), "liquid-assets");
  const update = useWrite(({ id: aid, patch }: { id: string; patch: Partial<LiquidAssetInput> & { version: number } }) => liquidAssetsApi.update(aid, patch), "liquid-assets");
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const e = entity.data;
  const toValues = (x: LiquidAsset): FormValues => ({
    security_id: x.security_id,
    name: x.name,
    asset_class: x.asset_class,
    currency_code: x.currency_code,
    issuer_counterparty_id: x.issuer_counterparty_id ?? "",
    market_value: x.market_value,
    haircut: x.haircut,
    is_encumbered: x.is_encumbered,
    maturity_date: x.maturity_date,
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schemaFor(system.businessDate, id === null)),
    mode: "onTouched",
    values: e ? toValues(e) : undefined,
    defaultValues: { security_id: "", name: "", asset_class: "GOVT_BOND", currency_code: "USD", issuer_counterparty_id: "", market_value: "", haircut: DEFAULT_HAIRCUT.GOVT_BOND, is_encumbered: false, maturity_date: "" },
    resetOptions: { keepDirtyValues: true },
  });
  const { register, control, handleSubmit, formState, setError, watch, setValue, getFieldState } = form;
  const { errors } = formState;
  useReportDirty(formState.isDirty, setDirty);
  const cls = watch("asset_class");
  const ccy = watch("currency_code");
  const mv = watch("market_value");
  const h = watch("haircut");
  const enc = watch("is_encumbered");
  const lv = isDecimal(mv) && isDecimal(h) ? (enc ? 0 : Number(mv) * (1 - Number(h))) : null;

  // A new asset class brings its illustrative default haircut, unless the user set one.
  const prevClass = useRef(cls);
  useEffect(() => {
    if (prevClass.current === cls) return;
    prevClass.current = cls;
    if (!getFieldState("haircut").isTouched) setValue("haircut", DEFAULT_HAIRCUT[cls as AssetClass], { shouldDirty: true });
  }, [cls, getFieldState, setValue]);

  const submit = handleSubmit(async (v) => {
    setBanner(null);
    const input: LiquidAssetInput = { ...v, issuer_counterparty_id: v.issuer_counterparty_id || null };
    try {
      let saved: LiquidAsset;
      if (!e) saved = await create.mutateAsync(input);
      else {
        const patch: Partial<LiquidAssetInput> = {};
        for (const k of FIELDS) if (k !== "security_id" && input[k] !== (e[k] ?? null)) (patch as Record<string, unknown>)[k] = input[k];
        saved = Object.keys(patch).length ? await update.mutateAsync({ id: e.id, patch: { ...patch, version: e.version } }) : e;
      }
      setDirty(false);
      toast.show({ tone: "positive", title: e ? "Changes saved" : `${saved.security_id} added`, detail: "Opening liquidity updated." });
      if (e) nav.closeEditor();
      else nav.view(saved.id);
    } catch (err) {
      setBanner(applyServerErrors(err, setError, FIELDS));
    }
  });

  return (
    <EditorDrawer
      noun="security"
      title={id ? `Edit ${e?.security_id ?? "security"}` : "Add a security"}
      formId={formId}
      isNew={id === null}
      dirty={dirty}
      saving={create.isPending || update.isPending}
      loading={id !== null && entity.isPending}
      loadError={entity.isError ? entity.error.message : null}
      submitLabel={id ? "Save changes" : "Add to buffer"}
      onClose={nav.closeEditor}
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5">
        <FormBanner
          banner={banner}
          onReloadLatest={() =>
            void entity.refetch().then((r) => {
              if (r.data) form.reset(toValues(r.data), { keepDirtyValues: false });
              setBanner(null);
            })
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Security ID" required={!e} error={errors.security_id?.message} hint={e ? "Fixed once created" : "ISIN-style, e.g. SYUSD4824997"}>
            {(p) => <Input {...p} {...register("security_id")} disabled={!!e} className="font-mono uppercase" spellCheck={false} />}
          </Field>
          <Field label="Asset class" required error={errors.asset_class?.message}>
            {(p) => (
              <Select {...p} {...register("asset_class")}>
                {ASSET_CLASSES.map((c) => <option key={c} value={c}>{ASSET_CLASS_LABEL[c]}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Name" required error={errors.name?.message}>
          {(p) => <Input {...p} {...register("name")} placeholder="e.g. USD Govt 4.25% 2029" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" required error={errors.currency_code?.message}>
            {(p) => (
              <Select {...p} {...register("currency_code")}>
                {CURRENCY_LIST.map((c) => <option key={c} value={c}>{c} · {CURRENCY_NAME[c]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Issuer" error={errors.issuer_counterparty_id?.message} hint="Optional; counts in credit concentration">
            {(p) => (
              <Select {...p} {...register("issuer_counterparty_id")}>
                <option value="">None (sovereign or supranational)</option>
                <CounterpartyOptions groups={cps.groups} />
              </Select>
            )}
          </Field>
          <Field label="Market value" required error={errors.market_value?.message}>
            {(p) => <Controller control={control} name="market_value" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={ccy} />} />}
          </Field>
          <Field label="Haircut" required error={errors.haircut?.message} hint={`Default for ${ASSET_CLASS_LABEL[cls as AssetClass].toLowerCase()}s: ${formatPercent(DEFAULT_HAIRCUT[cls as AssetClass], { dp: 0 })} (illustrative)`}>
            {(p) => <Controller control={control} name="haircut" render={({ field }) => <PercentInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />}
          </Field>
          <Field label="Maturity date" required error={errors.maturity_date?.message}>
            {(p) => <Input {...p} type="date" min={shiftDays(system.businessDate, 1)} {...register("maturity_date")} />}
          </Field>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md border border-line px-3 py-2.5">
          <div>
            <p id={`${formId}-enc`} className="text-sm font-medium text-fg">Encumbered</p>
            <p className="text-xs text-fg-faint">Pledged or lent securities don't count towards liquidity.</p>
          </div>
          <Controller control={control} name="is_encumbered" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} aria-labelledby={`${formId}-enc`} />} />
        </div>
        <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-fg-muted" aria-live="polite">
          Liquidity value{" "}
          <span className="font-semibold text-fg">{lv === null ? "–" : `${lv.toLocaleString("en", { minimumFractionDigits: ccy === "JPY" ? 0 : 2, maximumFractionDigits: ccy === "JPY" ? 0 : 2 })} ${ccy}`}</span>
          {enc && " (encumbered)"}
        </p>
      </form>
    </EditorDrawer>
  );
}

export function LiquidAssetsPage() {
  const can = useCan();
  const columns = useCallback(
    (open: (id: string) => void) => [
      col.accessor("security_id", {
        header: "Security",
        cell: ({ row }) => (
          <button type="button" onClick={() => open(row.original.id)} className="rounded-sm font-mono text-xs text-accent-strong hover:underline">
            {row.original.security_id}
          </button>
        ),
      }),
      col.accessor("name", { header: "Name", cell: (c) => <span className="block max-w-60 truncate">{c.getValue()}</span> }),
      col.accessor("asset_class", { header: "Class", cell: (c) => <span className="text-fg-muted">{ASSET_CLASS_LABEL[c.getValue()]}</span>, meta: { hideBelow: "lg" } }),
      col.accessor("market_value", { header: "Market value", cell: ({ row }) => <Money value={row.original.market_value} currency={row.original.currency_code} />, meta: { numeric: true, hint: "Sorted by USD equivalent" } }),
      col.accessor("haircut", { header: "Haircut", cell: (c) => formatPercent(c.getValue(), { dp: 1 }), meta: { numeric: true } }),
      col.accessor("liquidity_value", {
        header: "Liquidity value",
        cell: ({ row }) => (row.original.is_encumbered ? <Badge tone="caution">Encumbered</Badge> : <Money value={row.original.liquidity_value} currency={row.original.currency_code} hideCurrency />),
        meta: { numeric: true, hint: "Market value × (1 − haircut); zero when encumbered" },
      }),
      col.accessor("maturity_date", { header: "Maturity", cell: (c) => <span className="num text-fg-muted">{formatDate(c.getValue())}</span>, meta: { hideBelow: "xl" } }),
    ],
    [],
  );
  return (
    <ResourceListPage<LiquidAssetItem>
      title="Liquid Assets"
      description="The securities buffer. Unencumbered securities count towards opening liquidity at market value less an illustrative haircut."
      noun={["security", "securities"]}
      searchPlaceholder="Search name or security ID"
      defaultSort="-liquidity_value"
      filters={[
        { kind: "multi", key: "asset_class", label: "Class", options: ASSET_CLASSES.map((c) => ({ value: c, label: ASSET_CLASS_LABEL[c] })) },
        { kind: "multi", key: "currency_code", label: "Currency", options: CURRENCY_LIST.map((c) => ({ value: c, label: c })) },
        {
          kind: "segmented",
          key: "encumbrance",
          label: "Encumbrance",
          defaultValue: "all",
          options: [
            { value: "all", label: "All" },
            { value: "unencumbered", label: "Free" },
            { value: "encumbered", label: "Encumbered" },
          ],
        },
      ]}
      columns={columns}
      rowId={(r) => r.id}
      listQuery={(p) => ({ queryKey: ["liquid-assets", "list", p], queryFn: () => liquidAssetsApi.list(p as LiquidAssetFilters) })}
      exportCsv={(p) => liquidAssetsApi.exportCsv(p as LiquidAssetFilters)}
      summary={(p) => <SummaryStrip params={p} />}
      canCreate={can.analyst}
      canEdit={can.analyst}
      createLabel="Add security"
      renderDetail={(id, nav) => <AssetDetail id={id} nav={nav} />}
      renderEditor={(id, nav) => <AssetEditor id={id} nav={nav} />}
      empty={{ icon: <Vault />, title: "No securities in the buffer", description: "Add government bonds and other liquid securities." }}
    />
  );
}
