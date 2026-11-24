import { useState } from "react";
import { Link } from "react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { isApiError } from "@/api/problem";
import type { Counterparty, CounterpartySummary, RatingHistoryItem } from "@/api/counterparties";
import { useSession } from "@/app/session";
import { DetailSection, DetailSkeleton, MetricTile, RecordSection } from "@/components/data";
import { Alert, Badge, Button, ConfirmDialog, Drawer, IconButton, Menu, Money, RiskBadge, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatPercent } from "@/lib/format";
import { BAND_LABEL, COUNTERPARTY_TYPE_LABEL, RATINGS, countryName, isInvestmentGrade } from "@/mocks/reference";
import { useCounterparty, useCounterpartySummary, useDeleteCounterparty, useRatingHistory, useUpdateCounterparty } from "./queries";

function RiskSection({ c, s }: { c: Counterparty; s?: CounterpartySummary }) {
  const model = s?.latest_assessment;
  const disagrees = model && model.band !== c.risk_classification;
  return (
    <DetailSection title="Risk">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="mb-1 text-xs text-fg-muted">Analyst classification</dt>
          <dd>
            <RiskBadge band={c.risk_classification} />
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-fg-muted">Model assessment</dt>
          <dd className="flex items-center gap-2">
            {!s ? (
              <Skeleton className="h-5 w-24" />
            ) : model ? (
              <>
                <RiskBadge band={model.band} />
                <span className="num text-xs text-fg-faint">score {model.score}</span>
              </>
            ) : (
              <span className="text-xs text-fg-faint">Not assessed yet</span>
            )}
          </dd>
        </div>
      </dl>
      {disagrees && (
        <Alert tone="warning" title="Model and analyst disagree" className="mt-3">
          The model rates this counterparty {BAND_LABEL[model.band].toLowerCase()} (score {model.score}, {formatDate(model.as_of)}); the analyst
          classification is {BAND_LABEL[c.risk_classification].toLowerCase()}. Review the factor breakdown before changing either.{" "}
          <Link to={`/intelligence/counterparty-risk?id=${c.id}`} className="font-medium text-accent hover:text-accent-strong">
            Factor breakdown
          </Link>
        </Alert>
      )}
    </DetailSection>
  );
}

function RatingSection({ c, history }: { c: Counterparty; history?: RatingHistoryItem[] }) {
  return (
    <DetailSection title="Credit rating">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl font-semibold text-fg">{c.credit_rating}</span>
        <Badge tone={isInvestmentGrade(c.credit_rating) ? "neutral" : "caution"}>
          {isInvestmentGrade(c.credit_rating) ? "Investment grade" : "Sub-investment grade"}
        </Badge>
      </div>
      {!history ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : (
        <ol className="relative flex flex-col gap-2.5 border-l border-line-strong pl-4" aria-label="Rating history, newest first">
          {history.map((h, i) => {
            const prev = history[i + 1];
            const better = prev ? RATINGS.indexOf(h.credit_rating) < RATINGS.indexOf(prev.credit_rating) : null;
            return (
              <li key={h.effective_date} className="relative text-sm">
                <span className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface-1", i === 0 ? "bg-accent" : "bg-fg-faint")} aria-hidden />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-fg">{h.credit_rating}</span>
                    {prev && (
                      <span className={cn("inline-flex items-center gap-0.5 text-xs", better ? "text-positive" : "text-negative")}>
                        {better ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
                        {better ? "Upgrade" : "Downgrade"} from {prev.credit_rating}
                      </span>
                    )}
                    {!prev && <span className="text-xs text-fg-faint">First recorded</span>}
                  </span>
                  <span className="num shrink-0 text-xs text-fg-faint">{formatDate(h.effective_date)}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </DetailSection>
  );
}

function ExposureSection({ c, s }: { c: Counterparty; s?: CounterpartySummary }) {
  if (!s) {
    return (
      <DetailSection title="Exposure">
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </DetailSection>
    );
  }
  const pb = s.payment_behaviour;
  const ccy = s.exposure.currency;
  return (
    <>
      <DetailSection title={`Exposure · ${ccy} equivalent`}>
        <div className="grid grid-cols-2 gap-2">
          <MetricTile label="Funding provided" to={`/liquidity/concentration?basis=funding&counterparty_id=${c.id}`}>
            <Money value={s.exposure.funding} currency={ccy} compact tabular={false} />
          </MetricTile>
          <MetricTile label="Credit exposure" to={`/liquidity/concentration?basis=credit&counterparty_id=${c.id}`}>
            <Money value={s.exposure.credit} currency={ccy} compact tabular={false} />
          </MetricTile>
          <MetricTile label="Open deals" to={`/data/deals?counterparty_id=${c.id}`}>
            {s.open_deals}
          </MetricTile>
          <MetricTile label="Cash flows" to={`/data/cash-flows?counterparty_id=${c.id}`}>
            {s.cash_flows}
          </MetricTile>
        </div>
      </DetailSection>
      <DetailSection title={`Payment behaviour · last ${pb.window_days} days`}>
        {pb.settled === 0 ? (
          <p className="text-sm text-fg-faint">No settled cash flows in this window.</p>
        ) : (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-fg-muted">On time</dt>
              <dd className="num font-semibold text-fg">{formatPercent(pb.on_time_rate, { dp: 1 })}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Average delay</dt>
              <dd className="num font-semibold text-fg">{pb.avg_delay_days} days</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">Failed</dt>
              <dd className={cn("num font-semibold", pb.failed > 0 ? "text-negative" : "text-fg")}>{pb.failed}</dd>
            </div>
          </dl>
        )}
        <p className="mt-2 text-xs text-fg-faint">Across {pb.settled} settled cash flows.</p>
      </DetailSection>
    </>
  );
}

/** Read view of one counterparty. Edit opens the editor; deactivate and delete confirm first. */
export function CounterpartyDetail({ id, onClose, onEdit, onDeleted }: { id: string; onClose: () => void; onEdit: () => void; onDeleted: () => void }) {
  const { can } = useSession();
  const toast = useToast();
  const q = useCounterparty(id);
  const summary = useCounterpartySummary(id);
  const ratings = useRatingHistory(id);
  const update = useUpdateCounterparty();
  const del = useDeleteCounterparty();
  const [confirm, setConfirm] = useState<"deactivate" | "delete" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const c = q.data;

  const referenced = summary.data ? summary.data.open_deals + summary.data.cash_flows > 0 : true;

  const setActive = async (active: boolean) => {
    if (!c) return;
    setActionError(null);
    try {
      await update.mutateAsync({ id: c.id, patch: { is_active: active, version: c.version } });
      toast.show({ tone: "positive", title: active ? `${c.name} reactivated` : `${c.name} deactivated` });
      setConfirm(null);
    } catch (e) {
      const msg = isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server.";
      // Reactivating has no dialog to show the error in, so it gets a toast.
      if (active) toast.show({ tone: "negative", title: "Couldn't reactivate", detail: msg });
      else setActionError(msg);
    }
  };

  const remove = async () => {
    if (!c) return;
    setActionError(null);
    try {
      await del.mutateAsync({ id: c.id, version: c.version });
      toast.show({ tone: "positive", title: `${c.name} deleted`, detail: "Recorded in the audit log." });
      setConfirm(null);
      onDeleted();
    } catch (e) {
      setActionError(isApiError(e) ? (e.problem.detail ?? e.message) : "Couldn't reach the server.");
    }
  };

  const headerActions = c && can("RISK_ANALYST") && (
    <>
      <Button size="sm" icon={<Pencil />} onClick={onEdit}>
        Edit
      </Button>
      <Menu
        label="More actions"
        trigger={(p) => (
          <IconButton label="More actions" {...p}>
            <MoreHorizontal />
          </IconButton>
        )}
        items={[
          c.is_active
            ? { label: "Deactivate", icon: <Power />, onSelect: () => setConfirm("deactivate") }
            : { label: "Reactivate", icon: <Power />, onSelect: () => void setActive(true) },
          ...(can("ADMIN")
            ? [
                {
                  label: "Delete permanently",
                  icon: <Trash2 />,
                  tone: "danger" as const,
                  disabled: referenced,
                  hint: "Referenced by deals or cash flows. Deactivate it instead.",
                  onSelect: () => setConfirm("delete"),
                },
              ]
            : []),
        ]}
      />
    </>
  );

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={c?.name ?? (q.status === "error" ? "Counterparty" : "Loading…")}
        subtitle={
          c && (
            <span className="flex flex-wrap items-center gap-1.5">
              {COUNTERPARTY_TYPE_LABEL[c.counterparty_type]} · {countryName(c.country_code)}
              {!c.is_active && <Badge>Inactive</Badge>}
            </span>
          )
        }
        headerActions={headerActions}
      >
        {q.status === "pending" ? (
          <DetailSkeleton />
        ) : q.status === "error" ? (
          <div className="p-5">
            <Alert tone="negative" title={isApiError(q.error) && q.error.status === 404 ? "This counterparty no longer exists" : "Couldn't load this counterparty"}>
              {q.error.message}
            </Alert>
          </div>
        ) : (
          <>
            {!c!.is_active && (
              <div className="px-5 pt-4">
                <Alert tone="info" title="Inactive">
                  Excluded from new deals. Existing history, reports and exposure figures are unchanged.
                </Alert>
              </div>
            )}
            <RiskSection c={c!} s={summary.data} />
            <ExposureSection c={c!} s={summary.data} />
            <RatingSection c={c!} history={ratings.data} />
            <RecordSection record={c!} />
            <div className="px-5 pb-5">
              <Link to={`/data/deals?counterparty_id=${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong">
                View this counterparty's deals <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirm === "deactivate"}
        title={`Deactivate ${c?.name ?? ""}?`}
        body={
          <>
            It stays in history and reports but can't be used for new deals.
            {summary.data && summary.data.open_deals > 0 && ` Its ${summary.data.open_deals} open deals continue until they mature.`}
            {actionError && <Alert tone="negative" title="Couldn't deactivate" className="mt-3">{actionError}</Alert>}
          </>
        }
        confirmLabel="Deactivate"
        busy={update.isPending}
        onCancel={() => {
          setConfirm(null);
          setActionError(null);
        }}
        onConfirm={() => void setActive(false)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        tone="danger"
        title={`Delete ${c?.name ?? ""} permanently?`}
        body={
          <>
            This removes the counterparty and its rating history. It can't be undone. The deletion is recorded in the audit log.
            {actionError && <Alert tone="negative" title="Couldn't delete" className="mt-3">{actionError}</Alert>}
          </>
        }
        confirmLabel="Delete"
        busy={del.isPending}
        onCancel={() => {
          setConfirm(null);
          setActionError(null);
        }}
        onConfirm={() => void remove()}
      />
    </>
  );
}
