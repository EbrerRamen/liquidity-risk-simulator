import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { cashFlowsApi, type CashFlow, type CashFlowInput } from "@/api/cashFlows";
import { useSession } from "@/app/session";
import { applyServerErrors, EditorDrawer, FormBanner, useReportDirty, type Banner, type PanelNav } from "@/components/data";
import { Field, Input, MoneyInput, SegmentedControl, Select, useToast } from "@/components/ui";
import { shiftDays } from "@/lib/calendar";
import { isDecimal } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { CF_CATEGORY_LABEL, CURRENCY_LIST, CURRENCY_NAME, MANUAL_CF_CATEGORIES } from "@/mocks/reference";
import { CounterpartyOptions, useCounterpartyOptions, useWrite } from "../data-shared/shared";

const FIELDS = ["direction", "category", "currency_code", "amount", "expected_date", "counterparty_id"] as const;

function schemaFor(t0: string) {
  return z.object({
    direction: z.enum(["IN", "OUT"]),
    category: z.enum(MANUAL_CF_CATEGORIES as unknown as [string, ...string[]], { error: "Choose a category" }),
    currency_code: z.enum(CURRENCY_LIST, { error: "Choose a currency" }),
    amount: z.string().refine((v) => isDecimal(v) && Number(v) > 0, { error: "Enter an amount above zero" }),
    expected_date: z
      .string()
      .min(1, { error: "Enter the expected date" })
      .refine((v) => v > t0, { error: `Must be after the business date (${formatDate(t0)}). Record past flows by settling them.` }),
    counterparty_id: z.string(),
  });
}
type FormValues = z.infer<ReturnType<typeof schemaFor>>;

function CashFlowForm({
  formId,
  entity,
  onSaved,
  onDirtyChange,
  onSavingChange,
}: {
  formId: string;
  entity: CashFlow | null;
  onSaved: (f: CashFlow, created: boolean) => void;
  onDirtyChange: (d: boolean) => void;
  onSavingChange: (s: boolean) => void;
}) {
  const { system } = useSession();
  const cps = useCounterpartyOptions();
  const create = useWrite((i: CashFlowInput) => cashFlowsApi.create(i));
  const update = useWrite(({ id, patch }: { id: string; patch: Partial<CashFlowInput> & { version: number } }) => cashFlowsApi.update(id, patch));
  const [banner, setBanner] = useState<Banner | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schemaFor(system.businessDate)),
    mode: "onTouched",
    defaultValues: entity
      ? { direction: entity.direction, category: entity.category, currency_code: entity.currency_code, amount: entity.amount, expected_date: entity.expected_date, counterparty_id: entity.counterparty_id ?? "" }
      : { direction: "IN", category: "CUSTOMER", currency_code: "USD", amount: "", expected_date: shiftDays(system.businessDate, 1), counterparty_id: "" },
  });
  const { register, control, handleSubmit, formState, setError, watch } = form;
  const { errors } = formState;
  useReportDirty(formState.isDirty, onDirtyChange);
  useEffect(() => onSavingChange(create.isPending || update.isPending), [create.isPending, update.isPending, onSavingChange]);
  const ccy = watch("currency_code");

  const submit = handleSubmit(async (v) => {
    setBanner(null);
    const input = { ...v, counterparty_id: v.counterparty_id || null } as CashFlowInput;
    try {
      if (!entity) return onSaved(await create.mutateAsync(input), true);
      const patch: Partial<CashFlowInput> = {};
      for (const k of FIELDS) if (input[k] !== (entity[k] ?? null)) (patch as Record<string, unknown>)[k] = input[k];
      if (!Object.keys(patch).length) return onSaved(entity, false);
      onSaved(await update.mutateAsync({ id: entity.id, patch: { ...patch, version: entity.version } }), false);
    } catch (e) {
      setBanner(applyServerErrors(e, setError, FIELDS));
    }
  });

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5">
      <FormBanner banner={banner} />
      <p className="text-xs text-fg-muted">Manual flows are expected payments that no deal schedules, such as a client receipt or a tax payment. They count in projections until settled.</p>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg-muted">Direction<span className="ml-0.5 text-negative" aria-hidden>*</span></span>
        <Controller
          control={control}
          name="direction"
          render={({ field }) => <SegmentedControl label="Direction" value={field.value} onChange={field.onChange} options={[{ value: "IN", label: "Money in" }, { value: "OUT", label: "Money out" }]} />}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" required error={errors.category?.message} hint="Principal and interest come from deal schedules">
          {(p) => (
            <Select {...p} {...register("category")}>
              {MANUAL_CF_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CF_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Currency" required error={errors.currency_code?.message}>
          {(p) => (
            <Select {...p} {...register("currency_code")}>
              {CURRENCY_LIST.map((c) => (
                <option key={c} value={c}>
                  {c} · {CURRENCY_NAME[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Amount" required error={errors.amount?.message} hint="Positive; the direction gives the sign">
          {(p) => <Controller control={control} name="amount" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={ccy} />} />}
        </Field>
        <Field label="Expected date" required error={errors.expected_date?.message}>
          {(p) => <Input {...p} type="date" min={shiftDays(system.businessDate, 1)} {...register("expected_date")} />}
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
    </form>
  );
}

export function CashFlowEditor({ id, nav }: { id: string | null; nav: PanelNav }) {
  const formId = useId();
  const toast = useToast();
  const entity = useQuery({ queryKey: ["cash-flows", "detail", id], queryFn: () => cashFlowsApi.get(id!), enabled: id !== null });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const block = entity.data && !entity.data.actions.edit ? "Only open manual cash flows can be edited. Scheduled flows change through their deal." : null;
  return (
    <EditorDrawer
      noun="cash flow"
      title={id ? `Edit ${entity.data?.transaction_reference ?? "cash flow"}` : "New manual cash flow"}
      formId={formId}
      isNew={id === null}
      dirty={dirty}
      saving={saving}
      loading={id !== null && entity.isPending}
      loadError={entity.isError ? entity.error.message : block}
      submitLabel={id ? "Save changes" : "Add cash flow"}
      onClose={nav.closeEditor}
    >
      <CashFlowForm
        key={entity.data ? `${entity.data.id}-${entity.data.version}` : "new"}
        formId={formId}
        entity={entity.data ?? null}
        onDirtyChange={setDirty}
        onSavingChange={setSaving}
        onSaved={(f, created) => {
          setDirty(false);
          toast.show({ tone: "positive", title: created ? `Added ${f.transaction_reference}` : "Changes saved", detail: "Projections updated." });
          if (created) nav.view(f.id);
          else nav.closeEditor();
        }}
      />
    </EditorDrawer>
  );
}
