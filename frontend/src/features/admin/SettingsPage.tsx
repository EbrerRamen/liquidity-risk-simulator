import { useId, useMemo, useState } from "react";
import { Link, useBlocker } from "react-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { CalendarClock, ScrollText } from "lucide-react";
import { cashFlowsApi } from "@/api/cashFlows";
import { systemApi, type AppSettings, type AppSettingsPatch } from "@/api/system";
import { useSession } from "@/app/session";
import { applyServerErrors, FormBanner, type Banner } from "@/components/data";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, Button, buttonClass, Card, ConfirmDialog, ErrorState, Field, Input, MoneyInput, Skeleton, Switch, useToast } from "@/components/ui";
import { following, isBusinessDay, shiftDays, weekendMessage } from "@/lib/calendar";
import { isDecimal, roundDecimal } from "@/lib/decimal";
import { formatDate, formatDateTime, formatWeekday } from "@/lib/format";
import { useWrite } from "../data-shared/shared";

const FIELDS = ["business_date", "min_liquidity_buffer", "include_facilities_default"] as const;

/** Only the fields that changed, with the buffer at 2 decimal places. */
function toPatch(v: FormValues, s: AppSettings): AppSettingsPatch {
  const patch: AppSettingsPatch = { version: s.version };
  if (v.business_date !== s.business_date) patch.business_date = v.business_date;
  const buffer = roundDecimal(v.min_liquidity_buffer, 2);
  if (buffer !== s.min_liquidity_buffer) patch.min_liquidity_buffer = buffer;
  if (v.include_facilities_default !== s.include_facilities_default) patch.include_facilities_default = v.include_facilities_default;
  return patch;
}

function makeSchema(earliest: string) {
  return z.object({
    business_date: z
      .string()
      .min(1, { error: "Enter a date" })
      .refine(isBusinessDay, { error: "Choose a business day (Monday to Friday)" })
      .refine((v) => v >= earliest, { error: `Can't be before ${formatDate(earliest)}, the latest date with recorded activity` }),
    min_liquidity_buffer: z.string().refine((v) => isDecimal(v) && !v.startsWith("-"), { error: "Enter an amount of zero or more" }),
    include_facilities_default: z.boolean(),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const toValues = (s: AppSettings): FormValues => ({
  business_date: s.business_date,
  min_liquidity_buffer: s.min_liquidity_buffer,
  include_facilities_default: s.include_facilities_default,
});

/**
 * What moving T0 does to projected cash flows. Forward: flows due in between
 * and not yet settled turn overdue. Back: overdue flows in between turn upcoming.
 */
function DateImpact({ from, to }: { from: string; to: string }) {
  const forward = to > from;
  const range = forward ? { expected_from: shiftDays(from, 1), expected_to: to } : { expected_from: shiftDays(to, 1), expected_to: from };
  const view = forward ? "upcoming" : "overdue";
  const q = useQuery({
    queryKey: ["cash-flows", "list", "settings-impact", view, range],
    queryFn: () => cashFlowsApi.list({ view, ...range, page_size: 1 }),
  });
  const n = q.data?.total;
  const link = `/data/cash-flows?view=${view}&expected_from=${range.expected_from}&expected_to=${range.expected_to}`;
  const flows = n === 1 ? "1 projected cash flow" : `${n} projected cash flows`;

  return (
    <Alert tone={forward ? "warning" : "info"} title={forward ? `Moving forward to ${formatDate(to)}` : `Moving back to ${formatDate(to)}`} className="mt-3">
      {q.isPending ? (
        <Skeleton className="mt-1 h-4 w-64" />
      ) : q.isError ? (
        "Couldn't check which cash flows this affects."
      ) : n === 0 ? (
        forward ? "No projected cash flows fall due in between, so nothing turns overdue." : "No overdue cash flows fall in between."
      ) : forward ? (
        <>
          <Link to={link} className="font-medium text-fg underline-offset-2 hover:underline">{flows}</Link> fall due by then without being settled, so they'll show as overdue: overdue outflows count on day 1 of the projection, overdue inflows are left out (§5.4).
        </>
      ) : (
        <>
          <Link to={link} className="font-medium text-fg underline-offset-2 hover:underline">{flows}</Link> that are overdue today fall due after {formatDate(to)}, so they'll count as upcoming again.
        </>
      )}
      <span className="mt-1 block text-fg-muted">Projections, survival horizon and maturities restart from the new date. Nothing settles automatically.</span>
    </Alert>
  );
}

function SettingsForm({ settings }: { settings: AppSettings }) {
  const formId = useId();
  const toast = useToast();
  const { reload } = useSession();
  const save = useWrite((patch: AppSettingsPatch) => systemApi.updateSettings(patch));
  const [banner, setBanner] = useState<Banner | null>(null);
  const schema = useMemo(() => makeSchema(settings.earliest_business_date), [settings.earliest_business_date]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onTouched", values: toValues(settings), resetOptions: { keepDirtyValues: true } });
  const { register, control, handleSubmit, formState, setError, watch, setValue, reset } = form;
  const { errors, isDirty } = formState;
  // useForm's resetOptions keep dirty values when the server copy refreshes;
  // an explicit reset (after save, discard, reload) must replace them.
  const resetTo = (s: AppSettings) => reset(toValues(s), { keepDirtyValues: false });
  const date = watch("business_date");
  const dateValid = !!date && isBusinessDay(date) && date >= settings.earliest_business_date;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);

  const submit = handleSubmit(async (v) => {
    setBanner(null);
    const patch = toPatch(v, settings);
    try {
      const saved = await save.mutateAsync(patch);
      resetTo(saved);
      // The top bar and every screen read the business date from the session.
      await reload().catch(() => undefined);
      toast.show({
        tone: "positive",
        title: "Settings saved",
        detail: patch.business_date ? `Every screen now calculates as of ${formatWeekday(saved.business_date)} ${formatDate(saved.business_date)}.` : "Recorded in the audit log.",
      });
    } catch (err) {
      setBanner(applyServerErrors(err, setError, FIELDS));
    }
  });

  const nextDay = following(shiftDays(settings.business_date, 1));
  const weekend = date && !isBusinessDay(date) ? weekendMessage(date) : null;

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FormBanner
        banner={banner}
        onReloadLatest={() =>
          void systemApi.settings().then((s) => {
            resetTo(s);
            setBanner(null);
          })
        }
      />

      <Card title="Simulation business date" subtitle="T₀ for every as-of figure: positions, projections, overdue items and stress runs">
        <div className="grid gap-4 sm:grid-cols-[16rem_1fr] sm:items-start">
          <Field
            label="Business date"
            required
            error={weekend ?? errors.business_date?.message}
            hint={`Weekdays only, from ${formatDate(settings.earliest_business_date)}`}
          >
            {(p) => <Input {...p} type="date" min={settings.earliest_business_date} {...register("business_date")} />}
          </Field>
          <div className="flex flex-col gap-2 text-xs text-fg-muted sm:pt-6">
            <p>
              The data is synthetic and generated around a fixed date, so the business date stands in for "today". Move it forward to look ahead; it can't move back
              past recorded activity (the latest settlement, deal booking, FX rate or rating change).
            </p>
            {date !== nextDay && (
              <div>
                <Button size="sm" icon={<CalendarClock />} onClick={() => setValue("business_date", nextDay, { shouldDirty: true, shouldValidate: true })}>
                  Next business day: {formatWeekday(nextDay)} {formatDate(nextDay)}
                </Button>
              </div>
            )}
          </div>
        </div>
        {dateValid && date !== settings.business_date && <DateImpact from={settings.business_date} to={date} />}
      </Card>

      <Card title="Liquidity" subtitle="Thresholds and defaults for liquidity calculations">
        <div className="flex flex-col gap-5">
          <Field
            label="Minimum liquidity buffer"
            required
            className="max-w-xs"
            error={errors.min_liquidity_buffer?.message}
            hint={`B_min (§5.8), consolidated, in ${settings.base_currency}. Available liquidity below it sets the survival horizon and funding requirement.`}
          >
            {(p) => (
              <Controller
                control={control}
                name="min_liquidity_buffer"
                render={({ field }) => <MoneyInput {...p} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} currency={settings.base_currency} />}
              />
            )}
          </Field>
          <div className="flex items-start gap-3">
            <Controller
              control={control}
              name="include_facilities_default"
              render={({ field }) => <Switch checked={field.value} onChange={field.onChange} onBlur={field.onBlur} aria-labelledby={`${formId}-fac`} aria-describedby={`${formId}-fac-hint`} />}
            />
            <div>
              <p id={`${formId}-fac`} className="text-sm font-medium text-fg">Include committed facilities by default</p>
              <p id={`${formId}-fac-hint`} className="text-xs text-fg-muted">
                Counts undrawn committed lines in opening liquidity (§5.5) unless a calculation says otherwise. The default for liquidity analysis and stress runs; the dashboard always leaves them out.
              </p>
            </div>
          </div>
          <div className="text-sm">
            <span className="text-xs font-medium text-fg-muted">Base currency</span>
            <p className="mt-0.5">
              <span className="font-mono font-medium">{settings.base_currency}</span>
              <span className="ml-2 text-xs text-fg-faint">Fixed when the data is seeded. Changing it means re-seeding.</span>
            </p>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-1/95 px-4 py-3 backdrop-blur">
        <p className="text-xs text-fg-faint">
          {isDirty ? "Unsaved changes. Saving applies them for every user at once." : `Last changed ${formatDateTime(settings.updated_at)} by ${settings.updated_by ?? "seed data"} · version ${settings.version}`}
        </p>
        <div className="flex gap-2">
          <Button disabled={!isDirty || save.isPending} onClick={() => { resetTo(settings); setBanner(null); }}>
            Discard
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!isDirty}>
            Save settings
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Leave without saving?"
        body="Your changes to the settings haven't been saved."
        confirmLabel="Leave"
        tone="danger"
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </form>
  );
}

export function SettingsPage() {
  const q = useQuery({ queryKey: ["system", "settings"], queryFn: () => systemApi.settings() });
  return (
    <>
      <PageHeader
        title="Settings"
        description="Values every calculation uses, for every user. Each change is recorded in the audit log."
        actions={
          <Link to="/admin/audit?entity_type=settings" className={buttonClass("secondary", "md")}>
            <ScrollText aria-hidden />
            Change history
          </Link>
        }
      />
      <div className="max-w-4xl">
        {q.isPending ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : q.isError ? (
          <Card>
            <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
          </Card>
        ) : (
          <SettingsForm settings={q.data} />
        )}
      </div>
    </>
  );
}
