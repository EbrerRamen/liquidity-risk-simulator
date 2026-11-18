import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { dealsApi, type Deal, type DealInput } from "@/api/deals";
import { isApiError } from "@/api/problem";
import { useSession } from "@/app/session";
import { applyServerErrors, EditorDrawer, FormBanner, useReportDirty, type Banner, type PanelNav } from "@/components/data";
import { Field, Input, Money, MoneyInput, PercentInput, SegmentedControl, Select, Skeleton, Table, Td, Th, THead, Tr, useToast } from "@/components/ui";
import { addMonths, daysBetween, following, modifiedFollowing, shiftDays, weekendMessage } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { isDecimal } from "@/lib/decimal";
import { formatDate, formatDateShort, minorUnits } from "@/lib/format";
import { CURRENCY_LIST, CURRENCY_NAME, DAY_COUNTS, DAY_COUNT_LABEL, DEAL_TYPES, DEAL_TYPE_LABEL, FREQUENCIES, FREQUENCY_LABEL } from "@/mocks/reference";
import { DEFAULT_DAY_COUNT } from "@/mocks/schedule";
import { CounterpartyOptions, FlowDirection, useCounterpartyOptions, useWrite } from "../data-shared/shared";
import { editBlock } from "./DealDetail";

const FIELDS = ["counterparty_id", "direction", "deal_type", "currency_code", "principal", "interest_rate", "day_count", "deal_date", "value_date", "maturity_date", "interest_frequency"] as const;

function dealSchema(t0: string) {
  return z
    .object({
      counterparty_id: z.string().min(1, { error: "Choose a counterparty" }),
      direction: z.enum(["LEND", "BORROW"]),
      deal_type: z.enum(DEAL_TYPES, { error: "Choose a deal type" }),
      currency_code: z.enum(CURRENCY_LIST, { error: "Choose a currency" }),
      principal: z.string().refine((v) => isDecimal(v) && Number(v) > 0, { error: "Enter a principal above zero, e.g. 25m or 25,000,000" }),
      interest_rate: z.string().refine((v) => isDecimal(v) && Number(v) >= -0.1 && Number(v) <= 1, { error: "Enter a rate between -10% and 100%" }),
      day_count: z.enum(DAY_COUNTS),
      deal_date: z.string().min(1, { error: "Enter the trade date" }),
      value_date: z.string().min(1, { error: "Enter the value date" }),
      maturity_date: z.string().min(1, { error: "Enter the maturity date" }),
      interest_frequency: z.enum(FREQUENCIES),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      const dp = minorUnits(v.currency_code);
      if (isDecimal(v.principal) && (v.principal.split(".")[1]?.length ?? 0) > dp) issue("principal", `Use at most ${dp} decimal places for ${v.currency_code}`);
      if (v.deal_date && v.deal_date > t0) issue("deal_date", `Can't be after the business date (${formatDate(t0)})`);
      if (v.value_date) {
        if (v.value_date <= t0) issue("value_date", `Must be after the business date; ${formatDate(t0)} is closed`);
        else if (weekendMessage(v.value_date)) issue("value_date", weekendMessage(v.value_date)!);
        else if (v.deal_date && v.value_date < v.deal_date) issue("value_date", "Can't be before the trade date");
      }
      if (v.maturity_date && v.value_date) {
        if (v.maturity_date <= v.value_date) issue("maturity_date", "Must be after the value date");
        else if (weekendMessage(v.maturity_date)) issue("maturity_date", weekendMessage(v.maturity_date)!);
      }
    });
}
type DealForm = z.infer<ReturnType<typeof dealSchema>>;

const TENORS: { label: string; apply: (value: string) => string }[] = [
  { label: "1W", apply: (v) => following(shiftDays(v, 7)) },
  { label: "1M", apply: (v) => modifiedFollowing(addMonths(v, 1)) },
  { label: "3M", apply: (v) => modifiedFollowing(addMonths(v, 3)) },
  { label: "6M", apply: (v) => modifiedFollowing(addMonths(v, 6)) },
  { label: "1Y", apply: (v) => modifiedFollowing(addMonths(v, 12)) },
];

/** Debounce a value: the preview waits for typing to pause. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SchedulePreviewPanel({ input, valid }: { input: DealForm; valid: boolean }) {
  const debounced = useDebounced(input, 350);
  const ready = valid && JSON.stringify(debounced) === JSON.stringify(input);
  const q = useQuery({
    queryKey: ["deals", "preview", debounced],
    queryFn: () => dealsApi.previewSchedule(debounced as DealInput),
    enabled: valid,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60_000,
  });
  const p = q.data;
  const net = p ? Number(p.net_interest) : 0;

  return (
    <section aria-label="Cash-flow schedule preview" className="rounded-lg border border-line bg-surface-2">
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-fg">Cash-flow schedule</h3>
          <p className="text-xs text-fg-faint">Preview from the schedule engine. Nothing is saved until you book.</p>
        </div>
        {p && valid && (
          <div className="text-right text-xs">
            <div className="text-fg-muted">
              {p.flows.length} flows · {p.tenor_days} days
            </div>
            <div className="font-medium text-fg">
              Net interest <Money value={p.net_interest} currency={p.currency_code} sign="always" colored={false} />
            </div>
          </div>
        )}
      </header>
      <div className={cn("transition-opacity", (!ready || q.isFetching) && p && "opacity-60")} aria-live="polite">
        {!valid ? (
          <p className="px-4 py-6 text-center text-sm text-fg-faint">Complete the highlighted fields to see the schedule.</p>
        ) : q.isError ? (
          <p className="px-4 py-4 text-sm text-negative">
            {isApiError(q.error) ? (q.error.problem.errors?.map((e) => e.message).join(". ") ?? q.error.message) : "The preview couldn't be loaded."}
          </p>
        ) : !p ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Flow</Th>
                <Th>Direction</Th>
                <Th numeric>Amount</Th>
                <Th>Note</Th>
              </tr>
            </THead>
            <tbody>
              {p.flows.map((f, i) => (
                <Tr key={i}>
                  <Td className="num">{formatDate(f.date)}</Td>
                  <Td className="text-fg-muted">{f.kind === "PRINCIPAL" ? "Principal" : "Interest"}</Td>
                  <Td>
                    <FlowDirection direction={f.direction} />
                  </Td>
                  <Td numeric>
                    <Money value={f.amount} currency={p.currency_code} colored={false} />
                  </Td>
                  <Td className="text-xs text-fg-faint">
                    {f.unadjusted_date
                      ? `Moved from ${formatDateShort(f.unadjusted_date)} (Modified Following)`
                      : f.period
                        ? `${f.period.days} days, ${DAY_COUNT_LABEL[p.day_count]}`
                        : i === 0
                          ? "Value date"
                          : "Maturity"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {p && valid && net !== 0 && (
        <p className="border-t border-line px-4 py-2 text-xs text-fg-faint">
          {net > 0 ? "You receive" : "You pay"} the interest; {Number(debounced.interest_rate) < 0 ? "a negative rate reverses who pays." : "interest is quantised once, half-even, to minor units."}
        </p>
      )}
    </section>
  );
}

function DealForm({
  formId,
  entity,
  onSaved,
  onDirtyChange,
  onSavingChange,
}: {
  formId: string;
  entity: Deal | null;
  onSaved: (d: Deal, created: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const { system } = useSession();
  const t0 = system.businessDate;
  const cps = useCounterpartyOptions();
  const create = useWrite((input: DealInput) => dealsApi.create(input));
  const update = useWrite(({ id, patch }: { id: string; patch: Partial<DealInput> & { version: number } }) => dealsApi.update(id, patch));
  const [banner, setBanner] = useState<Banner | null>(null);
  const schema = useMemo(() => dealSchema(t0), [t0]);

  const defaultValue = following(shiftDays(t0, 1));
  const form = useForm<DealForm>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: entity
      ? Object.fromEntries(FIELDS.map((k) => [k, entity[k]])) as DealForm
      : {
          counterparty_id: "",
          direction: "LEND",
          deal_type: "TERM_DEPOSIT",
          currency_code: "USD",
          principal: "",
          interest_rate: "",
          day_count: "ACT_360",
          deal_date: t0,
          value_date: defaultValue,
          maturity_date: modifiedFollowing(addMonths(defaultValue, 3)),
          interest_frequency: "AT_MATURITY",
        },
  });
  const { register, control, handleSubmit, formState, setError, setValue, getValues, getFieldState } = form;
  const { errors, isDirty } = formState;
  useReportDirty(isDirty, onDirtyChange);
  useEffect(() => onSavingChange(create.isPending || update.isPending), [create.isPending, update.isPending, onSavingChange]);

  const values = useWatch({ control }) as DealForm;
  const valid = schema.safeParse(values).success;

  // Changing currency brings that market's day-count convention, unless the user
  // picked a day count themselves. Only an actual currency change triggers it, so an
  // amended deal keeps its own convention (and StrictMode's double effect run is harmless).
  const prevCurrency = useRef(values.currency_code);
  useEffect(() => {
    if (prevCurrency.current === values.currency_code) return;
    prevCurrency.current = values.currency_code;
    if (getFieldState("day_count").isTouched) return;
    const def = DEFAULT_DAY_COUNT[values.currency_code];
    if (def && def !== getValues("day_count")) setValue("day_count", def, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.currency_code]);

  const tenor = values.value_date && values.maturity_date && values.maturity_date > values.value_date ? daysBetween(values.value_date, values.maturity_date) : null;

  const onSubmit = handleSubmit(async (v) => {
    setBanner(null);
    try {
      if (!entity) return onSaved(await create.mutateAsync(v as DealInput), true);
      const patch: Partial<DealInput> = {};
      for (const k of FIELDS) if (v[k] !== entity[k]) (patch as Record<string, unknown>)[k] = v[k];
      if (Object.keys(patch).length === 0) return onSaved(entity, false);
      onSaved(await update.mutateAsync({ id: entity.id, patch: { ...patch, version: entity.version } }), false);
    } catch (err) {
      setBanner(applyServerErrors(err, setError, FIELDS));
    }
  });

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-5 px-5 py-5">
      <FormBanner banner={banner} />
      {entity && (
        <p className="text-xs text-fg-muted">
          Saving regenerates this deal's projected cash flows from the new terms. Nothing has settled yet, so every flow can change.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Counterparty" required error={errors.counterparty_id?.message} className="sm:col-span-2">
          {(p) => (
            <Select {...p} {...register("counterparty_id")} disabled={cps.loading}>
              <option value="" disabled>
                {cps.loading ? "Loading counterparties…" : "Choose a counterparty"}
              </option>
              <CounterpartyOptions groups={cps.groups} />
            </Select>
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">
            Direction<span className="ml-0.5 text-negative" aria-hidden>*</span>
          </span>
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <SegmentedControl label="Direction" value={field.value} onChange={field.onChange} options={[{ value: "LEND", label: "Lend" }, { value: "BORROW", label: "Borrow" }]} />
            )}
          />
          <p className="text-xs text-fg-faint">{values.direction === "LEND" ? "You pay the principal now and receive it back with interest." : "You receive the principal now and repay it with interest."}</p>
        </div>
        <Field label="Deal type" required error={errors.deal_type?.message}>
          {(p) => (
            <Select {...p} {...register("deal_type")}>
              {DEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {DEAL_TYPE_LABEL[t]}
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
        <Field label="Principal" required error={errors.principal?.message} hint="Type 25m, 1.5bn or 25,000,000">
          {(p) => (
            <Controller control={control} name="principal" render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={values.currency_code} />} />
          )}
        </Field>

        <Field label="Interest rate" required error={errors.interest_rate?.message} hint="Annual rate; negative rates are allowed">
          {(p) => <Controller control={control} name="interest_rate" render={({ field }) => <PercentInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">
            Day count<span className="ml-0.5 text-negative" aria-hidden>*</span>
          </span>
          <Controller
            control={control}
            name="day_count"
            render={({ field }) => (
              <SegmentedControl
                label="Day count"
                value={field.value}
                onChange={(v) => {
                  field.onChange(v);
                  field.onBlur();
                }}
                options={DAY_COUNTS.map((d) => ({ value: d, label: DAY_COUNT_LABEL[d] }))}
              />
            )}
          />
          <p className="text-xs text-fg-faint">Market default for {values.currency_code}: {DAY_COUNT_LABEL[DEFAULT_DAY_COUNT[values.currency_code] ?? "ACT_360"]}</p>
        </div>

        <Field label="Trade date" required error={errors.deal_date?.message}>
          {(p) => <Input {...p} type="date" {...register("deal_date")} max={t0} />}
        </Field>
        <Field label="Value date" required error={errors.value_date?.message} hint={`First open business day: ${formatDate(following(shiftDays(t0, 1)))}`}>
          {(p) => <Input {...p} type="date" {...register("value_date")} min={shiftDays(t0, 1)} />}
        </Field>

        <Field
          label="Maturity date"
          required
          error={errors.maturity_date?.message}
          hint={tenor !== null ? `Tenor ${tenor} days` : undefined}
          className="sm:col-span-2"
        >
          {(p) => (
            <div className="flex flex-wrap items-center gap-2">
              <Input {...p} type="date" {...register("maturity_date")} className="w-44" />
              <div className="flex gap-1" role="group" aria-label="Set maturity by tenor">
                {TENORS.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    disabled={!values.value_date}
                    onClick={() => setValue("maturity_date", t.apply(values.value_date), { shouldDirty: true, shouldValidate: true })}
                    className="h-8 rounded-md border border-line-strong bg-surface-2 px-2.5 text-xs font-medium text-fg-muted hover:text-fg disabled:opacity-45"
                    title={`Maturity ${t.label} after the value date, adjusted to a business day`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        <Field label="Interest paid" required error={errors.interest_frequency?.message} className="sm:col-span-2">
          {(p) => (
            <Select {...p} {...register("interest_frequency")}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <SchedulePreviewPanel input={values} valid={valid} />
    </form>
  );
}

/** Book a deal (id = null) or amend a pending one. */
export function DealEditor({ id, nav }: { id: string | null; nav: PanelNav }) {
  const formId = useId();
  const toast = useToast();
  const entity = useQuery({ queryKey: ["deals", "detail", id], queryFn: () => dealsApi.get(id!), enabled: id !== null });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const block = entity.data ? editBlock(entity.data) : null;

  return (
    <EditorDrawer
      width="lg"
      noun="deal"
      title={id ? `Amend ${entity.data?.deal_reference ?? "deal"}` : "Book a deal"}
      subtitle={id && entity.data ? <span className="font-mono">version {entity.data.version}</span> : undefined}
      formId={formId}
      isNew={id === null}
      dirty={dirty}
      saving={saving}
      loading={id !== null && entity.isPending}
      loadError={entity.isError ? entity.error.message : block}
      submitLabel={id ? "Save and regenerate schedule" : "Book deal"}
      onClose={nav.closeEditor}
    >
      <DealForm
        key={entity.data ? `${entity.data.id}-${entity.data.version}` : "new"}
        formId={formId}
        entity={entity.data ?? null}
        onDirtyChange={setDirty}
        onSavingChange={setSaving}
        onSaved={(d, created) => {
          setDirty(false);
          toast.show({ tone: "positive", title: created ? `Booked ${d.deal_reference}` : `${d.deal_reference} amended`, detail: created ? `${d.flows.total} cash flows scheduled.` : "Projected cash flows regenerated." });
          if (created) nav.view(d.id);
          else nav.closeEditor();
        }}
      />
    </EditorDrawer>
  );
}
