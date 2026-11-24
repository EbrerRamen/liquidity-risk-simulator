import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Counterparty } from "@/api/counterparties";
import { useSession } from "@/app/session";
import { applyServerErrors, EditorDrawer, FormBanner, useReportDirty, type Banner } from "@/components/data";
import { Field, Input, SegmentedControl, Select, Switch, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { BANDS, BAND_LABEL, COUNTERPARTY_TYPES, COUNTERPARTY_TYPE_LABEL, COUNTRIES, RATINGS, isInvestmentGrade } from "@/mocks/reference";
import { useCounterparty, useCreateCounterparty, useUpdateCounterparty } from "./queries";
import { counterpartySchema, type CounterpartyFormValues } from "./schema";

const FIELDS = ["name", "counterparty_type", "country_code", "credit_rating", "risk_classification", "is_active"] as const;

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));

function CounterpartyForm({
  formId,
  entity,
  create,
  update,
  onSaved,
  onDirtyChange,
  onReloadLatest,
}: {
  formId: string;
  entity: Counterparty | null;
  create: ReturnType<typeof useCreateCounterparty>;
  update: ReturnType<typeof useUpdateCounterparty>;
  onSaved: (saved: Counterparty, created: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onReloadLatest: () => void;
}) {
  const { system } = useSession();
  const [banner, setBanner] = useState<Banner | null>(null);

  const form = useForm<CounterpartyFormValues>({
    resolver: zodResolver(counterpartySchema),
    mode: "onTouched",
    defaultValues: entity
      ? {
          name: entity.name,
          counterparty_type: entity.counterparty_type,
          country_code: entity.country_code,
          credit_rating: entity.credit_rating,
          risk_classification: entity.risk_classification,
          is_active: entity.is_active,
        }
      : { name: "", country_code: "", risk_classification: "LOW", is_active: true },
  });
  const { register, control, handleSubmit, formState, setError, watch } = form;
  const { errors, isDirty } = formState;

  // Report dirtiness up so closing the panel can ask first.
  useReportDirty(isDirty, onDirtyChange);

  const rating = watch("credit_rating");
  const ratingChanged = entity ? rating !== entity.credit_rating : !!rating;

  const onSubmit = handleSubmit(async (values) => {
    setBanner(null);
    try {
      if (!entity) {
        const saved = await create.mutateAsync(values);
        onSaved(saved, true);
        return;
      }
      const patch: Partial<CounterpartyFormValues> = {};
      for (const k of FIELDS) if (values[k] !== entity[k]) (patch as Record<string, unknown>)[k] = values[k];
      if (Object.keys(patch).length === 0) return onSaved(entity, false);
      const saved = await update.mutateAsync({ id: entity.id, patch: { ...patch, version: entity.version } });
      onSaved(saved, false);
    } catch (err) {
      setBanner(applyServerErrors(err, setError, FIELDS));
    }
  });

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-5 px-5 py-5">
      <FormBanner banner={banner} onReloadLatest={onReloadLatest} />

      <Field label="Name" required error={errors.name?.message}>
        {(p) => <Input {...p} {...register("name")} autoComplete="off" placeholder="e.g. Northbridge Capital Bank" />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" required error={errors.counterparty_type?.message}>
          {(p) => (
            <Select {...p} {...register("counterparty_type")} defaultValue={entity?.counterparty_type ?? ""}>
              <option value="" disabled>
                Choose a type
              </option>
              {COUNTERPARTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COUNTERPARTY_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Country" required error={errors.country_code?.message}>
          {(p) => (
            <Select {...p} {...register("country_code")}>
              <option value="" disabled>
                Choose a country
              </option>
              {SORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field
        label="Credit rating"
        required
        error={errors.credit_rating?.message}
        hint={
          entity && ratingChanged
            ? `Recorded in rating history from ${formatDate(system.businessDate)}, the business date.`
            : "Current long-term rating. Changes are kept in rating history."
        }
      >
        {(p) => (
          <Select {...p} {...register("credit_rating")} defaultValue={entity?.credit_rating ?? ""}>
            <option value="" disabled>
              Choose a rating
            </option>
            <optgroup label="Investment grade">
              {RATINGS.filter(isInvestmentGrade).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sub-investment grade">
              {RATINGS.filter((r) => !isInvestmentGrade(r)).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </optgroup>
          </Select>
        )}
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-fg-muted">
          Risk classification<span className="ml-0.5 text-negative" aria-hidden>*</span>
        </span>
        <Controller
          control={control}
          name="risk_classification"
          render={({ field }) => (
            <SegmentedControl
              label="Risk classification"
              value={field.value}
              onChange={field.onChange}
              options={BANDS.map((b) => ({ value: b, label: BAND_LABEL[b] }))}
            />
          )}
        />
        <p className="text-xs text-fg-faint">Your judgement. The model's assessment is kept separately and shown beside it.</p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-md border border-line px-3 py-2.5">
        <div>
          <p id={`${formId}-active`} className="text-sm font-medium text-fg">
            Active
          </p>
          <p className="text-xs text-fg-faint">Inactive counterparties can't be used for new deals. Their history and reports stay intact.</p>
        </div>
        <Controller
          control={control}
          name="is_active"
          render={({ field }) => <Switch checked={field.value} onChange={field.onChange} aria-labelledby={`${formId}-active`} />}
        />
      </div>
    </form>
  );
}

/** Create (id = null) or edit a counterparty in a side panel. */
export function CounterpartyEditor({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: (saved: Counterparty, created: boolean) => void }) {
  const formId = useId();
  const toast = useToast();
  const entity = useCounterparty(id);
  const [dirty, setDirty] = useState(false);
  const create = useCreateCounterparty();
  const update = useUpdateCounterparty();

  return (
    <EditorDrawer
      noun="counterparty"
      title={id ? `Edit ${entity.data?.name ?? "counterparty"}` : "New counterparty"}
      subtitle={id && entity.data ? <span className="font-mono">{entity.data.id} · version {entity.data.version}</span> : undefined}
      formId={formId}
      isNew={id === null}
      dirty={dirty}
      saving={create.isPending || update.isPending}
      loading={id !== null && entity.status === "pending"}
      loadError={id && entity.status === "error" ? entity.error.message : null}
      submitLabel={id ? "Save changes" : "Create counterparty"}
      onClose={onClose}
    >
      <CounterpartyForm
        // Remount on a newer version so "Load latest" shows the server's values.
        key={entity.data ? `${entity.data.id}-${entity.data.version}` : "new"}
        formId={formId}
        entity={entity.data ?? null}
        create={create}
        update={update}
        onDirtyChange={setDirty}
        onReloadLatest={() => {
          void entity.refetch().then(() => toast.show({ tone: "info", title: "Loaded the latest version" }));
        }}
        onSaved={(saved, created) => {
          setDirty(false);
          onSaved(saved, created);
        }}
      />
    </EditorDrawer>
  );
}
