import { useCallback, useId, useState } from "react";
import { Link } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { z } from "zod";
import { MoreHorizontal, Pencil, Trash2, Wallet } from "lucide-react";
import { cashAccountsApi, type CashAccount, type CashAccountFilters, type CashAccountInput, type CashAccountItem } from "@/api/cashAccounts";
import { isApiError } from "@/api/problem";
import { useSession } from "@/app/session";
import { applyServerErrors, DetailSection, DetailSkeleton, EditorDrawer, FormBanner, MetricTile, RecordSection, ResourceListPage, useReportDirty, type Banner, type PanelNav } from "@/components/data";
import { Alert, Button, ConfirmDialog, Drawer, Field, IconButton, Input, Menu, Money, MoneyInput, Select, useToast } from "@/components/ui";
import { isDecimal } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL, CURRENCY_LIST, CURRENCY_NAME } from "@/mocks/reference";
import { useCan, useWrite } from "../data-shared/shared";

const col = createColumnHelper<CashAccountItem>();

function AccountDetail({ id, nav }: { id: string; nav: PanelNav }) {
  const can = useCan();
  const toast = useToast();
  const q = useQuery({ queryKey: ["cash-accounts", "detail", id], queryFn: () => cashAccountsApi.get(id) });
  const remove = useWrite((a: CashAccount) => cashAccountsApi.remove(a.id, a.version));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = q.data;
  return (
    <>
      <Drawer
        open
        onClose={nav.close}
        title={a?.name ?? "Cash account"}
        subtitle={a && `${a.currency_code} · ${ACCOUNT_TYPE_LABEL[a.account_type]}`}
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
          <div className="p-5"><Alert tone="negative" title="Couldn't load this account">{q.error.message}</Alert></div>
        ) : (
          a && (
            <>
              <DetailSection title="Balance">
                <div className="grid grid-cols-3 gap-2">
                  <MetricTile label="Opening" sub={`End of ${formatDate(a.opening_date)}`}><Money value={a.opening_balance} currency={a.currency_code} compact tabular={false} /></MetricTile>
                  <MetricTile label="Settled since" sub={`${a.settled_flows} cash flows`} to={`/data/cash-flows?view=settled&currency_code=${a.currency_code}`}>
                    <Money value={a.movement} currency={a.currency_code} compact sign="always" tabular={false} />
                  </MetricTile>
                  <MetricTile label="Current" sub="Cash at the business date"><Money value={a.current_balance} currency={a.currency_code} compact tabular={false} /></MetricTile>
                </div>
                <p className="mt-3 text-xs text-fg-faint">Cash(T₀) = opening balance + settled inflows − settled outflows after the opening date (§5.5). It is the cash part of opening liquidity.</p>
              </DetailSection>
              <RecordSection record={a} extra={[["Currency", `${a.currency_code} · ${CURRENCY_NAME[a.currency_code]}`]]} />
            </>
          )
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title={`Delete ${a?.name ?? "account"}?`}
        body={<>{a?.currency_code} cash would drop out of opening liquidity.{error && <Alert tone="negative" title="Couldn't delete" className="mt-3">{error}</Alert>}</>}
        confirmLabel="Delete"
        busy={remove.isPending}
        onCancel={() => {
          setConfirm(false);
          setError(null);
        }}
        onConfirm={() =>
          void remove
            .mutateAsync(a!)
            .then(() => {
              toast.show({ tone: "positive", title: `${a!.name} deleted` });
              nav.close();
            })
            .catch((e) => setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server."))
        }
      />
    </>
  );
}

const FIELDS = ["currency_code", "name", "account_type", "opening_balance", "opening_date"] as const;

function AccountEditor({ id, nav, taken }: { id: string | null; nav: PanelNav; taken: string[] }) {
  const formId = useId();
  const toast = useToast();
  const { system } = useSession();
  const t0 = system.businessDate;
  const entity = useQuery({ queryKey: ["cash-accounts", "detail", id], queryFn: () => cashAccountsApi.get(id!), enabled: id !== null });
  const create = useWrite((i: CashAccountInput) => cashAccountsApi.create(i), "cash-accounts");
  const update = useWrite(({ id: aid, patch }: { id: string; patch: Partial<CashAccountInput> & { version: number } }) => cashAccountsApi.update(aid, patch), "cash-accounts");
  const [dirty, setDirty] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const free = CURRENCY_LIST.filter((c) => !taken.includes(c));
  const schema = z.object({
    currency_code: z.enum(CURRENCY_LIST, { error: "Choose a currency" }),
    name: z.string().trim().min(2, { error: "Enter at least 2 characters" }),
    account_type: z.enum(ACCOUNT_TYPES),
    opening_balance: z.string().refine(isDecimal, { error: "Enter the balance (negative for an overdraft)" }),
    opening_date: z.string().refine((v) => !!v && v <= t0, { error: `Must be on or before the business date (${formatDate(t0)})` }),
  });
  type FormValues = z.infer<typeof schema>;
  const e = entity.data;
  const toValues = (x: CashAccount): FormValues => ({ currency_code: x.currency_code, name: x.name, account_type: x.account_type, opening_balance: x.opening_balance, opening_date: x.opening_date });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    values: e ? toValues(e) : undefined,
    defaultValues: { currency_code: free[0], name: "", account_type: "NOSTRO", opening_balance: "0", opening_date: t0 },
    resetOptions: { keepDirtyValues: true },
  });
  const { register, control, handleSubmit, formState, setError, watch } = form;
  const { errors } = formState;
  useReportDirty(formState.isDirty, setDirty);
  const ccy = watch("currency_code");

  const submit = handleSubmit(async (v) => {
    setBanner(null);
    try {
      let saved: CashAccount;
      if (!e) saved = await create.mutateAsync(v);
      else {
        const patch: Partial<CashAccountInput> = {};
        for (const k of FIELDS) if (k !== "currency_code" && v[k] !== e[k]) (patch as Record<string, unknown>)[k] = v[k];
        saved = Object.keys(patch).length ? await update.mutateAsync({ id: e.id, patch: { ...patch, version: e.version } }) : e;
      }
      setDirty(false);
      toast.show({ tone: "positive", title: e ? "Changes saved" : `${saved.name} added`, detail: `${saved.currency_code} cash is now ${Number(saved.current_balance).toLocaleString("en")}.` });
      if (e) nav.closeEditor();
      else nav.view(saved.id);
    } catch (err) {
      setBanner(applyServerErrors(err, setError, FIELDS));
    }
  });

  return (
    <EditorDrawer
      noun="cash account"
      title={id ? `Edit ${e?.name ?? "account"}` : "New cash account"}
      formId={formId}
      isNew={id === null}
      dirty={dirty}
      saving={create.isPending || update.isPending}
      loading={id !== null && entity.isPending}
      loadError={entity.isError ? entity.error.message : id === null && free.length === 0 ? "Every currency already has a cash account." : null}
      submitLabel={id ? "Save changes" : "Add account"}
      onClose={nav.closeEditor}
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5">
        <FormBanner banner={banner} onReloadLatest={() => void entity.refetch().then((r) => { if (r.data) form.reset(toValues(r.data), { keepDirtyValues: false }); setBanner(null); })} />
        {e && (
          <Alert tone="warning" title="This moves opening liquidity">
            The opening balance and date anchor {e.currency_code} cash. Changing them changes cash at the business date and every dashboard figure that uses it.
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" required error={errors.currency_code?.message} hint={e ? "Fixed: one account per currency" : undefined}>
            {(p) => (
              <Select {...p} {...register("currency_code")} disabled={!!e}>
                {(e ? [e.currency_code] : free).map((c) => <option key={c} value={c}>{c} · {CURRENCY_NAME[c]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Account type" required error={errors.account_type?.message}>
            {(p) => (
              <Select {...p} {...register("account_type")}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Name" required error={errors.name?.message}>
          {(p) => <Input {...p} {...register("name")} placeholder="e.g. GBP nostro account" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opening balance" required error={errors.opening_balance?.message} hint="Balance at the end of the opening date">
            {(p) => <Controller control={control} name="opening_balance" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={ccy} />} />}
          </Field>
          <Field label="Opening date" required error={errors.opening_date?.message} hint="Settled flows after this date add to the balance">
            {(p) => <Input {...p} type="date" max={t0} {...register("opening_date")} />}
          </Field>
        </div>
      </form>
    </EditorDrawer>
  );
}

export function CashAccountsPage() {
  const can = useCan();
  const all = useQuery({ queryKey: ["cash-accounts", "list", "all"], queryFn: () => cashAccountsApi.list({ page_size: 200 }) });
  const taken = all.data?.items.map((a) => a.currency_code) ?? [];
  const total = all.data?.items.reduce((s, a) => s + Number(a.current_balance_base), 0);

  const columns = useCallback(
    (open: (id: string) => void) => [
      col.accessor("currency_code", {
        header: "Currency",
        cell: ({ row }) => (
          <button type="button" onClick={() => open(row.original.id)} className="rounded-sm text-left hover:underline">
            <span className="font-mono text-xs font-medium text-accent-strong">{row.original.currency_code}</span>{" "}
            <span className="text-fg-muted max-lg:hidden">{CURRENCY_NAME[row.original.currency_code]}</span>
          </button>
        ),
      }),
      col.accessor("name", { header: "Account", cell: (c) => <span className="block max-w-56 truncate">{c.getValue()}</span> }),
      col.accessor("account_type", { header: "Type", cell: (c) => <span className="text-fg-muted">{ACCOUNT_TYPE_LABEL[c.getValue()]}</span>, meta: { hideBelow: "xl" } }),
      col.accessor("opening_balance", { header: "Opening", enableSorting: false, cell: ({ row }) => <Money value={row.original.opening_balance} currency={row.original.currency_code} hideCurrency />, meta: { numeric: true, hideBelow: "lg" } }),
      col.accessor("opening_date", { header: "As of", cell: (c) => <span className="num text-fg-muted">{formatDate(c.getValue())}</span>, meta: { hideBelow: "2xl" } }),
      col.accessor("movement", { header: "Settled since", enableSorting: false, cell: ({ row }) => <Money value={row.original.movement} currency={row.original.currency_code} hideCurrency sign="always" colored={false} />, meta: { numeric: true, hideBelow: "md" } }),
      col.accessor("current_balance", {
        header: "Current balance",
        cell: ({ row }) => <Money value={row.original.current_balance} currency={row.original.currency_code} />,
        meta: { numeric: true, hint: "Cash at the business date (§5.5). Sorted by USD equivalent" },
      }),
      col.accessor("current_balance_base", { header: "USD equivalent", enableSorting: false, cell: (c) => <Money value={c.getValue()} currency="USD" compact hideCurrency />, meta: { numeric: true, hideBelow: "xl" } }),
    ],
    [],
  );

  return (
    <ResourceListPage<CashAccountItem>
      title="Cash Accounts"
      description="One account per currency. Its opening balance plus settled cash flows gives the cash in opening liquidity."
      noun={["cash account", "cash accounts"]}
      defaultSort="currency_code"
      filters={[]}
      columns={columns}
      rowId={(r) => r.id}
      listQuery={(p) => ({ queryKey: ["cash-accounts", "list", p], queryFn: () => cashAccountsApi.list(p as CashAccountFilters) })}
      exportCsv={(p) => cashAccountsApi.exportCsv(p as CashAccountFilters)}
      summary={() =>
        total !== undefined && (
          <p className="mb-3 text-sm text-fg-muted">
            Total cash <span className="font-semibold text-fg"><Money value={total.toFixed(2)} currency="USD" compact hideCurrency /></span> USD equivalent at the business date ·{" "}
            <Link to="/data/cash-flows?view=settled" className="text-accent hover:text-accent-strong">Settled cash flows</Link>
          </p>
        )
      }
      canCreate={can.analyst && taken.length < CURRENCY_LIST.length}
      canEdit={can.analyst}
      createLabel="New account"
      renderDetail={(id, nav) => <AccountDetail id={id} nav={nav} />}
      renderEditor={(id, nav) => <AccountEditor id={id} nav={nav} taken={taken} />}
      empty={{ icon: <Wallet />, title: "No cash accounts", description: "Add one account per currency to anchor cash balances." }}
    />
  );
}
