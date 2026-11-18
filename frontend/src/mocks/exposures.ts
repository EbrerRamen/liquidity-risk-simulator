/**
 * Mock of /currency-exposures (TECHNICAL_PLAN §4.3, A2): positions not captured
 * elsewhere. Rate and base equivalent are computed at read time, never stored.
 */
import type { Exposure, ExposureFilters, ExposureInput, ExposureItem, ExposureSummary } from "@/api/exposures";
import type { Ccy } from "./dashboard-data";
import { crud, csvIn, decimalPlaces, isDec, isIsoDate, type FieldError } from "./crud";
import { db, type ExposureRecord } from "./db";
import { latency } from "./latency";
import { BASE_CCY, BUSINESS_DATE, cpName, money } from "./lookup";
import { ratesAt } from "./positions";
import { CURRENCY_LIST, EXPOSURE_TYPES, POSITIONS } from "./reference";
import { requireUser } from "./server";

const signedBase = (r: ExposureRecord) => (r.position === "LONG" ? 1 : -1) * Number(r.exposure_amount) * ratesAt()[r.currency_code as Ccy];

function toItem(r: ExposureRecord): ExposureItem {
  return {
    id: r.id,
    currency_code: r.currency_code,
    exposure_type: r.exposure_type,
    position: r.position,
    exposure_amount: r.exposure_amount,
    value_date: r.value_date,
    counterparty_id: r.counterparty_id,
    counterparty_name: cpName(r.counterparty_id),
    description: r.description,
    rate: ratesAt()[r.currency_code as Ccy].toFixed(8),
    base_equivalent: money(signedBase(r), BASE_CCY),
    version: r.version,
  };
}

function filterRows(rows: ExposureRecord[], f: ExposureFilters) {
  const q = f.q?.trim().toLowerCase();
  const ccys = csvIn(f.currency_code);
  const types = csvIn(f.exposure_type);
  const pos = csvIn(f.position);
  return rows.filter(
    (r) =>
      (!q || r.description.toLowerCase().includes(q) || (cpName(r.counterparty_id) ?? "").toLowerCase().includes(q)) &&
      (!ccys.length || ccys.includes(r.currency_code)) &&
      (!types.length || types.includes(r.exposure_type)) &&
      (!pos.length || pos.includes(r.position)) &&
      (!f.counterparty_id || r.counterparty_id === f.counterparty_id),
  );
}

const api = crud<ExposureRecord, ExposureFilters, ExposureItem, Exposure, ExposureInput>({
  base: "/api/v1/currency-exposures",
  entity: "currency exposure",
  idPrefix: "ex",
  table: () => db().exposures,
  setTable: (rows) => (db().exposures = rows),
  label: (r) => `${r.position} ${r.currency_code} ${r.exposure_type}`,
  filter: filterRows,
  sorters: {
    currency_code: (r) => r.currency_code,
    exposure_type: (r) => EXPOSURE_TYPES.indexOf(r.exposure_type),
    position: (r) => r.position,
    exposure_amount: (r) => Math.abs(signedBase(r)),
    base_equivalent: (r) => signedBase(r),
    value_date: (r) => r.value_date ?? "9999",
  },
  defaultSort: [{ field: "currency_code", dir: "asc" }, { field: "value_date", dir: "asc" }],
  toItem,
  toEntity: (r) => ({ ...toItem(r), is_synthetic: r.is_synthetic, created_at: r.created_at, updated_at: r.updated_at, created_by: r.created_by, updated_by: r.updated_by }),
  editable: ["currency_code", "exposure_type", "position", "exposure_amount", "value_date", "counterparty_id", "description"],
  normalize: (i) => (typeof i.description === "string" ? { ...i, description: i.description.trim() } : i),
  validate: (i) => {
    const e: FieldError[] = [];
    if (!CURRENCY_LIST.includes(i.currency_code)) e.push({ field: "currency_code", message: "choose a currency" });
    else if (i.currency_code === BASE_CCY) e.push({ field: "currency_code", message: `${BASE_CCY} is the base currency, so it carries no FX exposure` });
    if (!EXPOSURE_TYPES.includes(i.exposure_type)) e.push({ field: "exposure_type", message: "choose a type" });
    if (!POSITIONS.includes(i.position)) e.push({ field: "position", message: "choose long or short" });
    const dp = i.currency_code === "JPY" ? 0 : 2;
    if (!isDec(i.exposure_amount) || Number(i.exposure_amount) <= 0) e.push({ field: "exposure_amount", message: "enter an amount above zero" });
    else if (decimalPlaces(i.exposure_amount) > dp) e.push({ field: "exposure_amount", message: `use at most ${dp} decimal places for ${i.currency_code}` });
    const needsDate = i.exposure_type === "FX_SPOT" || i.exposure_type === "FX_FORWARD";
    if (needsDate && !i.value_date) e.push({ field: "value_date", message: "spot and forward positions need a value date" });
    if (i.value_date && (!isIsoDate(i.value_date) || i.value_date <= BUSINESS_DATE)) e.push({ field: "value_date", message: "must be after the business date" });
    if (!i.description || i.description.length < 3) e.push({ field: "description", message: "describe the position (at least 3 characters)" });
    if (i.description && i.description.length > 200) e.push({ field: "description", message: "keep it under 200 characters" });
    if (i.counterparty_id && !db().counterparties.some((c) => c.id === i.counterparty_id)) e.push({ field: "counterparty_id", message: "unknown counterparty" });
    return e;
  },
  build: (i, { id, user, now }) => ({
    id,
    ...i,
    value_date: i.value_date ?? null,
    counterparty_id: i.counterparty_id ?? null,
    is_synthetic: false,
    version: 1,
    created_at: now,
    updated_at: now,
    created_by: user.name,
    updated_by: user.name,
  }),
  deleteRole: "RISK_ANALYST",
  csv: {
    name: "currency_exposures",
    header: ["id", "currency_code", "exposure_type", "position", "exposure_amount", "value_date", "counterparty", "description", "rate_to_base", "base_equivalent"],
    row: (r) => {
      const it = toItem(r);
      return [r.id, r.currency_code, r.exposure_type, r.position, r.exposure_amount, r.value_date, it.counterparty_name, r.description, it.rate, it.base_equivalent];
    },
  },
});

/** Net manual position per currency (base equivalent). Not the full NOP, which also needs deals, cash and securities (§5.11). */
async function summary(f: ExposureFilters): Promise<ExposureSummary> {
  await latency(200, 400);
  requireUser("VIEWER");
  const rows = filterRows(db().exposures, f);
  const by = new Map<string, { long: number; short: number }>();
  for (const r of rows) {
    const v = by.get(r.currency_code) ?? { long: 0, short: 0 };
    v[r.position === "LONG" ? "long" : "short"] += Number(r.exposure_amount);
    by.set(r.currency_code, v);
  }
  const rates = ratesAt();
  const items = [...by.entries()]
    .map(([c, v]) => ({ currency_code: c, long: money(v.long, c), short: money(v.short, c), net: money(v.long - v.short, c), net_base: money((v.long - v.short) * rates[c as Ccy], BASE_CCY) }))
    .sort((a, b) => Math.abs(Number(b.net_base)) - Math.abs(Number(a.net_base)));
  const gross = rows.reduce((s, r) => s + Math.abs(signedBase(r)), 0);
  const net = rows.reduce((s, r) => s + signedBase(r), 0);
  return { base_currency: BASE_CCY, as_of: BUSINESS_DATE, items, gross_base: money(gross, BASE_CCY), net_base: money(net, BASE_CCY) };
}

export const exposuresMock = { ...api, summary };
