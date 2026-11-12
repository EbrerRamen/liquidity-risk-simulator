import { useState, type ReactNode } from "react";
import { ArrowDownToLine, Download, Filter, Play, Plus, RefreshCw, Search, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Money,
  RiskBadge,
  SegmentedControl,
  Select,
  Skeleton,
  Stat,
  Table,
  Tabs,
  Td,
  Th,
  THead,
  Tr,
  type Tone,
} from "@/components/ui";
import { formatCompact, formatDate, formatDecimal, formatMultiple, formatPercent } from "@/lib/format";

const SECTIONS = [
  { id: "colour", label: "Colour" },
  { id: "type", label: "Typography" },
  { id: "numbers", label: "Numbers" },
  { id: "kpis", label: "KPI tiles" },
  { id: "actions", label: "Actions" },
  { id: "status", label: "Status" },
  { id: "inputs", label: "Inputs" },
  { id: "tables", label: "Tables" },
  { id: "states", label: "States" },
] as const;

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {intro && <p className="mt-0.5 max-w-3xl text-sm text-fg-muted">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

/* ---------- Colour ---------- */

const SWATCHES: { group: string; note: string; tokens: { name: string; cls: string; hex: string }[] }[] = [
  {
    group: "Surfaces",
    note: "Three elevation steps above the canvas",
    tokens: [
      { name: "canvas", cls: "bg-canvas", hex: "#0a0e15" },
      { name: "surface-1", cls: "bg-surface-1", hex: "#0f141d" },
      { name: "surface-2", cls: "bg-surface-2", hex: "#151b26" },
      { name: "surface-3", cls: "bg-surface-3", hex: "#1b2331" },
      { name: "line", cls: "bg-line", hex: "#222b3a" },
      { name: "line-strong", cls: "bg-line-strong", hex: "#2e394b" },
    ],
  },
  {
    group: "Text",
    note: "Primary, secondary, tertiary",
    tokens: [
      { name: "fg", cls: "bg-fg", hex: "#e4e9f1" },
      { name: "fg-muted", cls: "bg-fg-muted", hex: "#9ba6b7" },
      { name: "fg-faint", cls: "bg-fg-faint", hex: "#6c7789" },
    ],
  },
  {
    group: "Accent and meaning",
    note: "Accent for interaction; the rest carry meaning",
    tokens: [
      { name: "accent", cls: "bg-accent", hex: "#6b9eea" },
      { name: "positive", cls: "bg-positive", hex: "#4cc293" },
      { name: "caution", cls: "bg-caution", hex: "#d6c25a" },
      { name: "warning", cls: "bg-warning", hex: "#e8a84a" },
      { name: "negative", cls: "bg-negative", hex: "#f07474" },
    ],
  },
];

function ColourSection() {
  return (
    <Section id="colour" title="Colour" intro="Dark-first. Semantic colours carry meaning (gain, loss, breach, risk) and are never decoration.">
      <div className="grid gap-4 lg:grid-cols-3">
        {SWATCHES.map((g) => (
          <Card key={g.group} title={g.group} subtitle={g.note}>
            <ul className="flex flex-col gap-2">
              {g.tokens.map((t) => (
                <li key={t.name} className="flex items-center gap-3">
                  <span className={`size-7 shrink-0 rounded-md ring-1 ring-line-strong ring-inset ${t.cls}`} />
                  <span className="flex-1 font-mono text-xs text-fg">{t.name}</span>
                  <span className="font-mono text-2xs text-fg-faint uppercase">{t.hex}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* ---------- Typography ---------- */

function TypeSection() {
  const rows: { name: string; spec: string; sample: ReactNode }[] = [
    { name: "Page title", spec: "xl · 20/28 · semibold", sample: <span className="text-xl font-semibold tracking-tight">Liquidity Position</span> },
    { name: "Section", spec: "lg · 16/24 · semibold", sample: <span className="text-lg font-semibold">Survival horizon by currency</span> },
    { name: "KPI value", spec: "2xl · 24/32 · semibold · tabular", sample: <span className="num text-2xl font-semibold tracking-tight">1.84bn</span> },
    { name: "Body", spec: "base · 14/22", sample: <span className="text-base">Opening liquidity is measured at the end of the business date.</span> },
    { name: "UI and tables", spec: "sm · 13/20", sample: <span className="text-sm">Counterparty · MM Deal · Maturity</span> },
    { name: "Caption", spec: "xs · 12/18 · muted", sample: <span className="text-xs text-fg-muted">Next 30 days, contractual flows only</span> },
    { name: "Overline", spec: "2xs · 11/16 · caps", sample: <span className="overline">Stress testing</span> },
    { name: "Identifier", spec: "IBM Plex Mono · xs", sample: <span className="font-mono text-xs">MMD-2026-004127 · req 7f3a91c2</span> },
  ];
  return (
    <Section id="type" title="Typography" intro="Inter for everything, with tabular figures for numbers. IBM Plex Mono only for identifiers and codes.">
      <Card flush>
        <ul>
          {rows.map((r) => (
            <li key={r.name} className="grid grid-cols-1 gap-1 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[180px_1fr] sm:items-baseline sm:gap-4">
              <div>
                <div className="text-xs font-medium text-fg-muted">{r.name}</div>
                <div className="text-2xs text-fg-faint">{r.spec}</div>
              </div>
              <div className="min-w-0 truncate text-fg">{r.sample}</div>
            </li>
          ))}
        </ul>
      </Card>
    </Section>
  );
}

/* ---------- Numbers ---------- */

function NumbersSection() {
  const rows: { input: string; rule: string; out: ReactNode }[] = [
    { input: '"1842500000.00" USD', rule: "Exact, grouped, minor units", out: <Money value="1842500000.00" currency="USD" /> },
    { input: '"1842500000.00"', rule: "Compact for KPIs, exact in tooltip", out: <Money value="1842500000.00" currency="USD" compact /> },
    { input: '"-212480000.50" USD', rule: "Negative: minus sign and colour", out: <Money value="-212480000.50" currency="USD" /> },
    { input: '"38250000" (delta)', rule: "Signed delta", out: <Money value="38250000" currency="USD" compact sign="always" /> },
    { input: '"1250000000" JPY', rule: "Zero minor units", out: <Money value="1250000000" currency="JPY" /> },
    { input: '"126388.885" USD', rule: "Round half-even (matches backend)", out: <Money value="126388.885" currency="USD" /> },
    { input: '"0.0525"', rule: "Rate stored as a fraction", out: formatPercent("0.0525") },
    { input: '"-0.0035"', rule: "Negative rate", out: <span className="num text-negative">{formatPercent("-0.0035")}</span> },
    { input: '"1.3826"', rule: "Coverage multiple (SLCI)", out: formatMultiple("1.3826") },
    { input: '"0.183"', rule: "HHI index, 3 dp", out: formatDecimal("0.183", { dp: 3 }) },
    { input: '"2026-11-12"', rule: "Calendar date", out: formatDate("2026-11-12") },
  ];
  return (
    <Section
      id="numbers"
      title="Numbers"
      intro={
        <>
          Money arrives as decimal strings and is formatted exactly. Compact notation ({formatCompact("1842500000")}) is
          display-only. Currency codes are always shown, and negatives always carry a minus so colour is never the only cue.
        </>
      }
    >
      <Card flush>
        <Table>
          <THead>
            <tr>
              <Th>API value</Th>
              <Th>Rule</Th>
              <Th numeric>Rendered</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.input + r.rule}>
                <Td mono className="text-fg-muted">{r.input}</Td>
                <Td className="text-fg-muted">{r.rule}</Td>
                <Td numeric className="font-medium">{r.out}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Section>
  );
}

/* ---------- KPI tiles ---------- */

function KpiSection() {
  const [loading, setLoading] = useState(false);
  return (
    <Section
      id="kpis"
      title="KPI tiles"
      intro="Label, compact value with currency, and one line of context. Delta colour follows whether the change is good, not its direction."
    >
      <div className="mb-3 flex justify-end">
        <Button size="sm" icon={<RefreshCw />} onClick={() => setLoading((l) => !l)}>
          {loading ? "Show values" : "Show loading"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          loading={loading}
          label="Available liquidity"
          value={<Money value="1842500000.00" currency="USD" compact />}
          delta={{ text: "+2.1%", direction: "up", good: true }}
          caption="vs. previous business day"
          info="Cash plus haircut-adjusted unencumbered securities at end of the business date. Committed facilities excluded."
        />
        <Stat
          loading={loading}
          label="Net cash flow · 30d"
          value={<Money value="-212480000.50" currency="USD" compact />}
          caption="Contractual flows only"
        />
        <Stat
          loading={loading}
          label="SLCI · 30d"
          value={<span className="num">{formatMultiple("1.3826")}</span>}
          delta={{ text: "−0.12", direction: "down", good: false }}
          caption="Simulated · not the LCR"
          info="Simulated Liquidity Coverage Indicator: opening liquidity over 30-day net outflows, with inflows capped at 75% of outflows. Non-regulatory."
        />
        <Stat
          loading={loading}
          label="Survival horizon"
          value={
            <span className="num">
              23 <span className="text-base font-medium text-fg-muted">days</span>
            </span>
          }
          caption="First breach 05 Dec 2026"
          flag={<Badge tone="warning" dot>Below 30d</Badge>}
          info="Days until available liquidity first falls below the minimum buffer (250m USD)."
        />
      </div>
    </Section>
  );
}

/* ---------- Actions ---------- */

function ActionsSection() {
  return (
    <Section id="actions" title="Actions" intro="One primary action per view. Icon-only buttons always have an accessible label and a tooltip.">
      <Card>
        <div className="flex flex-col gap-5">
          <Row label="Variants">
            <Button variant="primary" icon={<Play />}>Run scenario</Button>
            <Button icon={<Plus />}>New deal</Button>
            <Button variant="ghost" icon={<Filter />}>Filters</Button>
            <Button variant="danger">Cancel deal</Button>
          </Row>
          <Row label="Small">
            <Button size="sm" variant="primary">Save</Button>
            <Button size="sm" icon={<Download />}>Export CSV</Button>
            <Button size="sm" variant="ghost">Reset</Button>
          </Row>
          <Row label="States">
            <Button variant="primary" loading>Running…</Button>
            <Button disabled>Disabled</Button>
          </Row>
          <Row label="Icon buttons">
            <IconButton label="Export CSV"><ArrowDownToLine /></IconButton>
            <IconButton label="Refresh"><RefreshCw /></IconButton>
            <IconButton label="Column settings"><Settings2 /></IconButton>
          </Row>
        </div>
      </Card>
    </Section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[120px_1fr] sm:items-center">
      <span className="text-xs text-fg-faint">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/* ---------- Status ---------- */

const CASH_FLOW_STATUS: { label: string; tone: Tone }[] = [
  { label: "Projected", tone: "accent" },
  { label: "Settled", tone: "positive" },
  { label: "Overdue", tone: "warning" },
  { label: "Failed", tone: "negative" },
  { label: "Cancelled", tone: "neutral" },
];

function StatusSection() {
  return (
    <Section id="status" title="Status" intro="Risk bands pair a text label with a level meter, so they read correctly without colour.">
      <Card>
        <div className="flex flex-col gap-5">
          <Row label="Risk bands">
            <RiskBadge band="LOW" />
            <RiskBadge band="MEDIUM" />
            <RiskBadge band="HIGH" />
            <RiskBadge band="CRITICAL" />
          </Row>
          <Row label="Cash flow status">
            {CASH_FLOW_STATUS.map((s) => (
              <Badge key={s.label} tone={s.tone} dot>{s.label}</Badge>
            ))}
          </Row>
          <Row label="Tags">
            <Badge>LEND</Badge>
            <Badge>BORROW</Badge>
            <Badge tone="accent">Champion</Badge>
            <Badge tone="caution">Model disagrees</Badge>
            <Badge tone="warning">Estimate</Badge>
          </Row>
        </div>
      </Card>
    </Section>
  );
}

/* ---------- Inputs ---------- */

const HORIZONS = [
  { value: "1", label: "1D" },
  { value: "7", label: "7D" },
  { value: "14", label: "14D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
] as const;

function InputsSection() {
  const [horizon, setHorizon] = useState<string>("30");
  const [granularity, setGranularity] = useState<"day" | "week">("day");
  const [tab, setTab] = useState<"summary" | "flows" | "attribution">("summary");
  return (
    <Section id="inputs" title="Inputs" intro="Labels sit above controls. Numeric inputs are right-aligned with the unit inside the field.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Form fields" subtitle="New MM deal (excerpt)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Counterparty" required className="sm:col-span-2">
              {(p) => (
                <Select {...p} defaultValue="nb">
                  <option value="nb">Northbridge Capital Bank</option>
                  <option value="hs">Helvetia Savings AG</option>
                </Select>
              )}
            </Field>
            <Field label="Principal" required hint="Positive amount; direction sets the sign">
              {(p) => <Input {...p} numeric suffix="USD" defaultValue="25,000,000.00" />}
            </Field>
            <Field label="Interest rate" required>
              {(p) => <Input {...p} numeric suffix="%" defaultValue="5.2500" />}
            </Field>
            <Field label="Value date" required>
              {(p) => <Input {...p} type="date" defaultValue="2026-11-13" />}
            </Field>
            <Field label="Maturity date" required error="Must be after the value date">
              {(p) => <Input {...p} type="date" defaultValue="2026-11-10" />}
            </Field>
            <Field label="Search" className="sm:col-span-2">
              {(p) => (
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-faint" />
                  <Input {...p} placeholder="Reference or counterparty" className="pl-8" />
                </div>
              )}
            </Field>
          </div>
        </Card>
        <Card title="View controls" subtitle="Horizon, granularity and tabs">
          <div className="flex flex-col gap-5">
            <Row label="Horizon">
              <SegmentedControl label="Horizon" options={HORIZONS} value={horizon} onChange={setHorizon} />
            </Row>
            <Row label="Granularity">
              <SegmentedControl
                label="Granularity"
                size="sm"
                options={[
                  { value: "day", label: "Daily" },
                  { value: "week", label: "Weekly" },
                ]}
                value={granularity}
                onChange={setGranularity}
              />
            </Row>
            <div>
              <Tabs
                label="Execution sections"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: "summary", label: "Summary" },
                  { value: "flows", label: "Daily flows", count: 30 },
                  { value: "attribution", label: "Attribution", count: 5 },
                ]}
              />
              <p className="pt-3 text-xs text-fg-muted">
                Selected: <span className="font-medium text-fg">{tab}</span> · horizon{" "}
                <span className="num font-medium text-fg">{horizon}</span> days · {granularity}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Section>
  );
}

/* ---------- Tables ---------- */

const DEALS = [
  { ref: "MMD-2026-004127", cpty: "Northbridge Capital Bank", type: "Term deposit", dir: "BORROW", amount: "250000000.00", ccy: "USD", rate: "0.0525", maturity: "2026-11-19", band: "MEDIUM" as const },
  { ref: "MMD-2026-004131", cpty: "Helvetia Savings AG", type: "Call money", dir: "LEND", amount: "80000000.00", ccy: "CHF", rate: "0.0110", maturity: "2026-11-13", band: "LOW" as const },
  { ref: "MMD-2026-004098", cpty: "Pacific Rim Trust", type: "Repo", dir: "BORROW", amount: "12500000000", ccy: "JPY", rate: "-0.0010", maturity: "2026-12-02", band: "HIGH" as const },
  { ref: "MMD-2026-004140", cpty: "Thames Merchant Finance", type: "Term placement", dir: "LEND", amount: "45000000.00", ccy: "GBP", rate: "0.0472", maturity: "2027-02-12", band: "CRITICAL" as const },
];

function TablesSection() {
  return (
    <Section
      id="tables"
      title="Tables"
      intro="Dense 36px rows, numbers right-aligned in tabular figures, identifiers in mono, currency shown on every amount."
    >
      <Card
        title="Upcoming maturities"
        subtitle="Static sample; server-paginated tables arrive with Data management"
        actions={<Button size="sm" icon={<Download />}>Export CSV</Button>}
        flush
      >
        <Table>
          <THead>
            <tr>
              <Th>Reference</Th>
              <Th>Counterparty</Th>
              <Th>Type</Th>
              <Th>Direction</Th>
              <Th numeric>Principal</Th>
              <Th numeric>Rate</Th>
              <Th>Maturity</Th>
              <Th>Counterparty risk</Th>
            </tr>
          </THead>
          <tbody>
            {DEALS.map((d) => (
              <Tr key={d.ref}>
                <Td mono className="text-accent-strong">{d.ref}</Td>
                <Td>{d.cpty}</Td>
                <Td className="text-fg-muted">{d.type}</Td>
                <Td><Badge>{d.dir}</Badge></Td>
                <Td numeric><Money value={d.amount} currency={d.ccy} /></Td>
                <Td numeric className={d.rate.startsWith("-") ? "text-negative" : undefined}>{formatPercent(d.rate)}</Td>
                <Td className="num">{formatDate(d.maturity)}</Td>
                <Td><RiskBadge band={d.band} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Section>
  );
}

/* ---------- States ---------- */

function StatesSection() {
  return (
    <Section id="states" title="States" intro="Skeletons while loading. Empty states explain what's missing and offer the next step. Errors show a retry and the request ID.">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Loading">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-1/5" />
            </div>
          </div>
        </Card>
        <Card title="Empty">
          <EmptyState
            title="No stress executions yet"
            description="Run a scenario to see baseline vs stressed liquidity here."
            action={<Button size="sm" variant="primary" icon={<Play />}>Run a scenario</Button>}
            className="py-4"
          />
        </Card>
        <Card title="Error">
          <ErrorState
            message="The liquidity engine timed out. Try a shorter horizon or retry."
            requestId="7f3a91c2-4be0"
            onRetry={() => undefined}
            className="py-4"
          />
        </Card>
      </div>
    </Section>
  );
}

export function DesignSystemPage() {
  return (
    <>
      <PageHeader
        title="Design system"
        description="Foundations and primitives for every screen. Dark-first, dense, and built so numbers are exact and meaning never depends on colour alone."
      />
      <div className="flex gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-10 pb-16">
          <ColourSection />
          <TypeSection />
          <NumbersSection />
          <KpiSection />
          <ActionsSection />
          <StatusSection />
          <InputsSection />
          <TablesSection />
          <StatesSection />
        </div>
        <nav aria-label="On this page" className="sticky top-20 hidden h-fit w-40 shrink-0 2xl:block">
          <div className="overline mb-2">On this page</div>
          <ul className="flex flex-col gap-0.5 border-l border-line">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1 pl-3 text-xs text-fg-muted hover:border-fg-faint hover:text-fg">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
