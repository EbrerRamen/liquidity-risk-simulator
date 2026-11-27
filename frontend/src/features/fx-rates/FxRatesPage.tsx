import { useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Plus, Repeat, Trash2 } from "lucide-react";
import { fxRatesApi, type FxHistoryPoint, type FxLatest } from "@/api/fxRates";
import { isApiError } from "@/api/problem";
import { useSession } from "@/app/session";
import { AXIS_TICK, C, ChartTooltipBox, MARK, niceScale, tickDate } from "@/components/charts";
import { DetailSection, EditorDrawer, FormBanner, type Banner } from "@/components/data";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, ErrorState, Field, IconButton, Input, Select, Skeleton, Table, Td, Th, THead, Tr, useToast } from "@/components/ui";
import { isBusinessDay, shiftDays, weekendMessage } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { formatDate, formatPercent } from "@/lib/format";
import { CURRENCY_LIST, CURRENCY_NAME, type CurrencyCode } from "@/mocks/reference";
import { useCan, useWrite } from "../data-shared/shared";

const NON_BASE: readonly CurrencyCode[] = CURRENCY_LIST.filter((c) => c !== "USD");

/** USD per unit, with enough decimals to be meaningful (JPY needs 6). */
const fmtRate = (r: string | number, ccy: string) => Number(r).toFixed(ccy === "JPY" ? 6 : 4);
/** Units per USD: the usual market quote for JPY (USD/JPY ~ 151). */
const fmtInverse = (r: string | number, ccy: string) => (1 / Number(r)).toFixed(ccy === "JPY" ? 2 : 4);

function Sparkline({ values, label }: { values: string[]; label: string }) {
  const nums = values.map(Number);
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const w = 96;
  const h = 24;
  const pts = nums.map((v, i) => [(i / Math.max(1, nums.length - 1)) * (w - 4) + 2, hi === lo ? h / 2 : h - 3 - ((v - lo) / (hi - lo)) * (h - 6)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="inline-block">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill="var(--color-accent)" stroke="var(--color-surface-1)" strokeWidth={1.5} />}
    </svg>
  );
}

function Change({ value }: { value: string | null }) {
  if (value === null) return <span className="text-fg-faint">–</span>;
  return <span className="num text-fg">{formatPercent(value, { dp: 2, sign: "always" })}</span>;
}

/* ---------- history panel ---------- */

function HistoryDrawer({ ccy, onClose }: { ccy: CurrencyCode; onClose: () => void }) {
  const can = useCan();
  const toast = useToast();
  const q = useQuery({ queryKey: ["fx-rates", "history", ccy], queryFn: () => fxRatesApi.history(ccy) });
  const remove = useWrite((id: number) => fxRatesApi.remove(id));
  const [confirm, setConfirm] = useState<FxHistoryPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const rows = useMemo(() => q.data ?? [], [q.data]);
  const series = useMemo(() => [...rows].reverse().map((r) => ({ date: r.rate_date, rate: Number(r.rate_to_base), manual: r.source === "MANUAL" })), [rows]);
  const y = niceScale(Math.min(...series.map((s) => s.rate)), Math.max(...series.map((s) => s.rate)), 5);
  const manual = rows.filter((r) => r.source === "MANUAL").length;

  return (
    <>
      <Drawer open width="lg" onClose={onClose} title={`${ccy} · ${CURRENCY_NAME[ccy]}`} subtitle={`USD per 1 ${ccy}, ${rows.length} business-day rates${manual ? ` · ${manual} entered manually` : ""}`}>
        {q.isPending ? (
          <div className="p-5">
            <Skeleton className="h-64 w-full" />
          </div>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : (
          <>
            <div className="flex justify-end px-5 pt-4">
              <div role="group" aria-label="View" className="flex rounded-md border border-line p-0.5 text-xs">
                {(["chart", "table"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("rounded-sm px-2 py-1", view === v ? "bg-surface-3 text-fg" : "text-fg-faint hover:text-fg-muted")}>
                    {v === "chart" ? "Chart" : "Table"}
                  </button>
                ))}
              </div>
            </div>
            {view === "chart" ? (
              <DetailSection title="Rate history">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                      <CartesianGrid vertical={false} stroke={C.grid} />
                      <XAxis dataKey="date" tickFormatter={tickDate} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: C.axis }} minTickGap={36} tickMargin={8} />
                      <YAxis domain={y.domain} ticks={y.ticks} tickFormatter={(v: number) => fmtRate(v, ccy)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={ccy === "JPY" ? 70 : 52} />
                      <ChartTooltip
                        cursor={{ stroke: C.axis, strokeWidth: 1 }}
                        isAnimationActive={false}
                        content={({ active, payload }) => {
                          const p = active ? (payload?.[0]?.payload as (typeof series)[number] | undefined) : undefined;
                          if (!p) return null;
                          return (
                            <ChartTooltipBox
                              title={formatDate(p.date)}
                              rows={[
                                { key: "r", label: "USD per unit", value: fmtRate(p.rate, ccy), color: C.accent },
                                { key: "i", label: `${ccy} per USD`, value: fmtInverse(p.rate, ccy) },
                              ]}
                              footer={p.manual ? "Entered manually" : "Generated (synthetic)"}
                            />
                          );
                        }}
                      />
                      <Line
                        type="linear"
                        dataKey="rate"
                        stroke={C.accent}
                        strokeWidth={MARK.line}
                        isAnimationActive={false}
                        activeDot={{ r: MARK.dot, fill: C.accent, stroke: C.surface, strokeWidth: 2 }}
                        dot={(props: { cx?: number; cy?: number; payload?: { manual: boolean }; index?: number }) =>
                          props.payload?.manual ? <circle key={props.index} cx={props.cx} cy={props.cy} r={MARK.dot} fill={C.warning} stroke={C.surface} strokeWidth={2} /> : <g key={props.index} />
                        }
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {manual > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-faint">
                    <span className="inline-block size-2 rounded-full bg-warning" aria-hidden /> Manually entered rate
                  </p>
                )}
              </DetailSection>
            ) : (
              <DetailSection title="Rate history">
                <div className="-mx-5">
                  <Table>
                    <THead>
                      <tr>
                        <Th>Date</Th>
                        <Th numeric>USD per {ccy}</Th>
                        <Th numeric>{ccy} per USD</Th>
                        <Th>Source</Th>
                        {can.admin && <Th>{""}</Th>}
                      </tr>
                    </THead>
                    <tbody>
                      {rows.map((r) => (
                        <Tr key={r.id}>
                          <Td className="num">{formatDate(r.rate_date)}</Td>
                          <Td numeric>{fmtRate(r.rate_to_base, ccy)}</Td>
                          <Td numeric className="text-fg-muted">{fmtInverse(r.rate_to_base, ccy)}</Td>
                          <Td>{r.source === "MANUAL" ? <Badge tone="warning">Manual · {r.created_by}</Badge> : <span className="text-xs text-fg-faint">Synthetic</span>}</Td>
                          {can.admin && (
                            <Td>
                              {r.source === "MANUAL" && (
                                <IconButton size="sm" label={`Delete the manual rate for ${formatDate(r.rate_date)}`} onClick={() => setConfirm(r)}>
                                  <Trash2 />
                                </IconButton>
                              )}
                            </Td>
                          )}
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </DetailSection>
            )}
            <DetailSection title="How rates are used">
              <p className="text-sm text-fg-muted">
                Each date uses the latest rate on or before it (§5.2). Projections convert at the business-date rate, with no forward points. History converts at each day's own rate.
              </p>
            </DetailSection>
          </>
        )}
      </Drawer>
      <ConfirmDialog
        open={!!confirm}
        tone="danger"
        title={`Delete the manual ${ccy} rate for ${confirm ? formatDate(confirm.rate_date) : ""}?`}
        body={
          <>
            Dates from then on fall back to the previous rate. Recorded in the audit log.
            {error && <Alert tone="negative" title="Couldn't delete" className="mt-3">{error}</Alert>}
          </>
        }
        confirmLabel="Delete rate"
        busy={remove.isPending}
        onCancel={() => {
          setConfirm(null);
          setError(null);
        }}
        onConfirm={() =>
          void remove
            .mutateAsync(confirm!.id)
            .then(() => {
              toast.show({ tone: "positive", title: "Manual rate deleted" });
              setConfirm(null);
            })
            .catch((e) => setError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server."))
        }
      />
    </>
  );
}

/* ---------- add a rate ---------- */

function AddRateDrawer({ initialCcy, onClose, onSaved }: { initialCcy: CurrencyCode; onClose: () => void; onSaved: (ccy: CurrencyCode) => void }) {
  const { system } = useSession();
  const t0 = system.businessDate;
  const formId = useId();
  const toast = useToast();
  const [ccy, setCcy] = useState<CurrencyCode>(initialCcy);
  const [date, setDate] = useState(t0);
  const [rate, setRate] = useState("");
  const [replace, setReplace] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const history = useQuery({ queryKey: ["fx-rates", "history", ccy], queryFn: () => fxRatesApi.history(ccy) });
  const create = useWrite(() => fxRatesApi.create({ currency_code: ccy, rate_date: date, rate_to_base: rate.trim(), replace }));

  const sameDay = history.data?.find((r) => r.rate_date === date);
  const reference = history.data?.find((r) => r.rate_date <= date);
  const valid = /^\d+(\.\d{1,8})?$/.test(rate.trim()) && Number(rate) > 0;
  const move = valid && reference ? Number(rate) / Number(reference.rate_to_base) - 1 : null;
  const dirty = rate !== "" || date !== t0 || ccy !== initialCcy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!date) errs.rate_date = "Enter the rate date";
    else if (date > t0) errs.rate_date = `Can't be after the business date (${formatDate(t0)})`;
    else if (!isBusinessDay(date)) errs.rate_date = weekendMessage(date) ?? "Rates are recorded for business days only";
    if (!valid) errs.rate_to_base = "Enter a rate above zero with at most 8 decimal places";
    if (sameDay && !replace) errs.rate_date = `A ${sameDay.source.toLowerCase()} rate of ${fmtRate(sameDay.rate_to_base, ccy)} already exists for this date. Tick "Replace" to override it.`;
    setErrors(errs);
    setBanner(null);
    if (Object.keys(errs).length) return;
    try {
      await create.mutateAsync(undefined);
      toast.show({ tone: "positive", title: `${ccy} rate recorded for ${formatDate(date)}`, detail: date === t0 ? "USD equivalents across the app now use it." : "Dates from then on use it until the next rate." });
      onSaved(ccy);
    } catch (err) {
      if (isApiError(err) && err.problem.errors?.length) setErrors(Object.fromEntries(err.problem.errors.map((x) => [x.field, x.message.charAt(0).toUpperCase() + x.message.slice(1)])));
      else setBanner({ title: "Couldn't save the rate", detail: isApiError(err) ? err.message : "The server couldn't be reached." });
    }
  };

  return (
    <EditorDrawer noun="FX rate" title="Record an FX rate" formId={formId} isNew dirty={dirty} saving={create.isPending} submitLabel={sameDay ? "Replace rate" : "Record rate"} onClose={onClose}>
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5 px-5 py-5">
        <FormBanner banner={banner} />
        <p className="text-xs text-fg-muted">Rates are quoted as USD per 1 unit of the currency (rate_to_base). Generated history stays as it is; manual rates are marked and audited.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" required>
            {(p) => (
              <Select {...p} value={ccy} onChange={(e) => { setCcy(e.target.value as CurrencyCode); setReplace(false); }}>
                {NON_BASE.map((c) => <option key={c} value={c}>{c} · {CURRENCY_NAME[c]}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Rate date" required error={errors.rate_date}>
            {(p) => <Input {...p} name="rate_date" type="date" max={t0} value={date} onChange={(e) => { setDate(e.target.value); setReplace(false); }} />}
          </Field>
        </div>
        <Field label={`USD per 1 ${ccy}`} required error={errors.rate_to_base} hint={valid ? `${fmtInverse(rate, ccy)} ${ccy} per USD` : `e.g. ${reference ? fmtRate(reference.rate_to_base, ccy) : "1.0842"}`}>
          {(p) => <Input {...p} name="rate_to_base" numeric inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/,/g, ""))} />}
        </Field>

        {reference && (
          <div className="rounded-md bg-surface-2 px-3 py-2 text-sm text-fg-muted" aria-live="polite">
            {sameDay ? "Existing rate for this date" : `Rate in use on ${formatDate(date)}`}: <span className="num font-medium text-fg">{fmtRate(reference.rate_to_base, ccy)}</span>{" "}
            <span className="text-xs">({formatDate(reference.rate_date)}, {reference.source.toLowerCase()})</span>
            {move !== null && (
              <>
                {" "}· change <span className="num font-medium text-fg">{formatPercent(move.toFixed(6), { dp: 2, sign: "always" })}</span>
              </>
            )}
          </div>
        )}
        {move !== null && Math.abs(move) > 0.03 && (
          <Alert tone="warning" title={`That's a ${formatPercent(Math.abs(move).toFixed(6), { dp: 1 })} move`}>
            Check the rate and its direction: it should be USD per 1 {ccy}, not {ccy} per USD.
          </Alert>
        )}
        {sameDay && (
          <label className="flex items-start gap-2.5 rounded-md border border-warning-line bg-warning-soft px-3 py-2.5 text-sm text-fg">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 accent-[var(--color-warning)]" />
            <span>
              Replace the existing {sameDay.source.toLowerCase()} rate for {formatDate(date)}
              <span className="block text-xs text-fg-muted">Rates are unique per currency and date. The replacement is recorded in the audit log.</span>
            </span>
          </label>
        )}
      </form>
    </EditorDrawer>
  );
}

/* ---------- page ---------- */

export function FxRatesPage() {
  const { system } = useSession();
  const can = useCan();
  const [sp, setSp] = useSearchParams();
  const q = useQuery({ queryKey: ["fx-rates", "latest"], queryFn: () => fxRatesApi.latest() });
  const open = sp.get("ccy") as CurrencyCode | null;
  const adding = sp.get("new") === "1";
  const set = (patch: Record<string, string | null>, push = false) =>
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: !push },
    );

  const stale = (r: FxLatest) => r.rate_date < shiftDays(system.businessDate, -3);

  return (
    <>
      <PageHeader
        title="FX Rates"
        description={`Rates to the base currency (USD per unit). Each date uses the latest rate on or before it; everything converts at the ${formatDate(system.businessDate)} rate.`}
        actions={
          can.analyst && (
            <Button variant="primary" icon={<Plus />} onClick={() => set({ new: "1", ccy: null }, true)}>
              Record rate
            </Button>
          )
        }
      />
      <Card title="Latest rates" subtitle={`As of ${formatDate(system.businessDate)} · select a currency for its history`} flush>
        {q.isPending ? (
          <div className="flex flex-col gap-3 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : q.isError ? (
          <ErrorState message={q.error.message} onRetry={() => void q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState icon={<Repeat />} title="No rates yet" description="Record a rate for each currency to convert amounts to USD." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Currency</Th>
                <Th numeric>USD per unit</Th>
                <Th numeric className="max-md:hidden">Units per USD</Th>
                <Th numeric>1 day</Th>
                <Th numeric className="max-md:hidden">30 days</Th>
                <Th className="max-lg:hidden">30-day trend</Th>
                <Th className="max-lg:hidden">Rate date</Th>
                <Th>Source</Th>
              </tr>
            </THead>
            <tbody>
              {q.data.map((r) => (
                <Tr key={r.currency_code} className={cn("cursor-pointer", open === r.currency_code && "bg-accent-soft")} onClick={() => set({ ccy: r.currency_code, new: null }, true)}>
                  <Td>
                    <button type="button" className="rounded-sm text-left hover:underline" onClick={(e) => { e.stopPropagation(); set({ ccy: r.currency_code, new: null }, true); }}>
                      <span className="font-mono text-xs font-medium text-accent-strong">{r.currency_code}</span> <span className="text-fg-muted max-sm:hidden">{CURRENCY_NAME[r.currency_code]}</span>
                    </button>
                  </Td>
                  <Td numeric className="font-medium">{fmtRate(r.rate_to_base, r.currency_code)}</Td>
                  <Td numeric className="text-fg-muted max-md:hidden">{fmtInverse(r.rate_to_base, r.currency_code)}</Td>
                  <Td numeric><Change value={r.change_1d} /></Td>
                  <Td numeric className="max-md:hidden"><Change value={r.change_30d} /></Td>
                  <Td className="max-lg:hidden"><Sparkline values={r.trend} label={`${r.currency_code} over 30 business days`} /></Td>
                  <Td className="num text-fg-muted max-lg:hidden">
                    {formatDate(r.rate_date)}
                    {stale(r) && <Badge tone="warning" className="ml-2">Stale</Badge>}
                  </Td>
                  <Td>{r.source === "MANUAL" ? <Badge tone="warning">Manual</Badge> : <span className="text-xs text-fg-faint">Synthetic</span>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="mt-3 text-xs text-fg-faint">Changes show how many USD one unit buys: positive means the currency strengthened against USD. Synthetic rates are generated for this simulation.</p>

      {open && NON_BASE.includes(open) && <HistoryDrawer ccy={open} onClose={() => set({ ccy: null })} />}
      {adding && can.analyst && (
        <AddRateDrawer
          initialCcy={(open as CurrencyCode) ?? "EUR"}
          onClose={() => set({ new: null })}
          onSaved={(c) => set({ new: null, ccy: c })}
        />
      )}
    </>
  );
}
