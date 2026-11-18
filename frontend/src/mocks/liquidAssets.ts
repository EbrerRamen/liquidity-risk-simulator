/** Mock of /liquid-assets (TECHNICAL_PLAN §4.3). Liquidity value = MV x (1 - haircut), zero when encumbered (§5.5). */
import type { LiquidAsset, LiquidAssetFilters, LiquidAssetInput, LiquidAssetItem, LiquidAssetSummary } from "@/api/liquidAssets";
import { crud, csvIn, decimalPlaces, isDec, isIsoDate, type FieldError } from "./crud";
import { db, type LiquidAssetRecord } from "./db";
import { latency } from "./latency";
import { BASE_CCY, BUSINESS_DATE, cpName, money, toBase } from "./lookup";
import { ASSET_CLASSES, CURRENCY_LIST } from "./reference";
import { requireUser } from "./server";

const lv = (r: Pick<LiquidAssetRecord, "market_value" | "haircut" | "is_encumbered">) => (r.is_encumbered ? 0 : Number(r.market_value) * (1 - Number(r.haircut)));

function toItem(r: LiquidAssetRecord): LiquidAssetItem {
  return {
    id: r.id,
    security_id: r.security_id,
    name: r.name,
    asset_class: r.asset_class,
    currency_code: r.currency_code,
    issuer_counterparty_id: r.issuer_counterparty_id,
    issuer_name: cpName(r.issuer_counterparty_id),
    market_value: r.market_value,
    haircut: r.haircut,
    liquidity_value: money(lv(r), r.currency_code),
    is_encumbered: r.is_encumbered,
    maturity_date: r.maturity_date,
    version: r.version,
  };
}

function filterRows(rows: LiquidAssetRecord[], f: LiquidAssetFilters) {
  const q = f.q?.trim().toLowerCase();
  const cls = csvIn(f.asset_class);
  const ccys = csvIn(f.currency_code);
  const enc = f.encumbrance ?? "all";
  return rows.filter(
    (r) =>
      (!q || r.name.toLowerCase().includes(q) || r.security_id.toLowerCase().includes(q)) &&
      (!cls.length || cls.includes(r.asset_class)) &&
      (!ccys.length || ccys.includes(r.currency_code)) &&
      (!f.issuer_counterparty_id || r.issuer_counterparty_id === f.issuer_counterparty_id) &&
      (enc === "all" || (enc === "encumbered" ? r.is_encumbered : !r.is_encumbered)),
  );
}

const api = crud<LiquidAssetRecord, LiquidAssetFilters, LiquidAssetItem, LiquidAsset, LiquidAssetInput>({
  base: "/api/v1/liquid-assets",
  entity: "liquid asset",
  idPrefix: "la",
  table: () => db().liquidAssets,
  setTable: (rows) => (db().liquidAssets = rows),
  label: (r) => `${r.security_id} ${r.name}`,
  filter: filterRows,
  sorters: {
    security_id: (r) => r.security_id,
    name: (r) => r.name,
    asset_class: (r) => ASSET_CLASSES.indexOf(r.asset_class),
    currency_code: (r) => r.currency_code,
    market_value: (r) => toBase(r.market_value, r.currency_code),
    haircut: (r) => Number(r.haircut),
    liquidity_value: (r) => toBase(lv(r), r.currency_code),
    maturity_date: (r) => r.maturity_date,
  },
  defaultSort: [{ field: "liquidity_value", dir: "desc" }],
  toItem,
  toEntity: (r) => ({ ...toItem(r), is_synthetic: r.is_synthetic, created_at: r.created_at, updated_at: r.updated_at, created_by: r.created_by, updated_by: r.updated_by }),
  // The security ID is fixed once created (it identifies the position).
  editable: ["name", "asset_class", "currency_code", "issuer_counterparty_id", "market_value", "haircut", "is_encumbered", "maturity_date"],
  normalize: (i) => ({ ...i, ...(typeof i.name === "string" ? { name: i.name.trim() } : {}), ...(typeof i.security_id === "string" ? { security_id: i.security_id.trim().toUpperCase() } : {}) }),
  validate: (i, existing) => {
    const e: FieldError[] = [];
    if (!existing && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(i.security_id ?? "")) e.push({ field: "security_id", message: "use 12 characters: 2 letters, 9 letters or digits, 1 check digit" });
    if (!i.name || i.name.length < 2) e.push({ field: "name", message: "must be at least 2 characters" });
    if (!ASSET_CLASSES.includes(i.asset_class)) e.push({ field: "asset_class", message: "choose an asset class" });
    if (!CURRENCY_LIST.includes(i.currency_code)) e.push({ field: "currency_code", message: "choose a currency" });
    const dp = i.currency_code === "JPY" ? 0 : 2;
    if (!isDec(i.market_value) || Number(i.market_value) < 0) e.push({ field: "market_value", message: "enter a market value of zero or more" });
    else if (decimalPlaces(i.market_value) > dp) e.push({ field: "market_value", message: `use at most ${dp} decimal places for ${i.currency_code}` });
    if (!isDec(i.haircut) || Number(i.haircut) < 0 || Number(i.haircut) >= 1) e.push({ field: "haircut", message: "must be at least 0% and below 100%" });
    else if (decimalPlaces(i.haircut) > 6) e.push({ field: "haircut", message: "use at most 4 decimal places in percent" });
    if (!isIsoDate(i.maturity_date) || i.maturity_date <= BUSINESS_DATE) e.push({ field: "maturity_date", message: "must be after the business date" });
    if (i.issuer_counterparty_id && !db().counterparties.some((c) => c.id === i.issuer_counterparty_id)) e.push({ field: "issuer_counterparty_id", message: "unknown counterparty" });
    return e;
  },
  duplicates: (i, existing) =>
    !existing && db().liquidAssets.some((r) => r.security_id === i.security_id) ? [{ field: "security_id", message: "This security is already in the buffer" }] : [],
  build: (i, { id, user, now }) => ({
    id,
    ...i,
    issuer_counterparty_id: i.issuer_counterparty_id ?? null,
    is_synthetic: false,
    version: 1,
    created_at: now,
    updated_at: now,
    created_by: user.name,
    updated_by: user.name,
  }),
  csv: {
    name: "liquid_assets",
    header: ["id", "security_id", "name", "asset_class", "currency_code", "issuer", "market_value", "haircut", "liquidity_value", "is_encumbered", "maturity_date"],
    row: (r) => [r.id, r.security_id, r.name, r.asset_class, r.currency_code, cpName(r.issuer_counterparty_id), r.market_value, r.haircut, money(lv(r), r.currency_code), r.is_encumbered, r.maturity_date],
  },
});

/** Buffer totals in base currency for the summary strip. */
async function summary(f: LiquidAssetFilters): Promise<LiquidAssetSummary> {
  await latency(200, 400);
  requireUser("VIEWER");
  const rows = filterRows(db().liquidAssets, f);
  let buffer = 0;
  let mvFree = 0;
  let mvEnc = 0;
  for (const r of rows) {
    const mv = toBase(r.market_value, r.currency_code);
    if (r.is_encumbered) mvEnc += mv;
    else {
      mvFree += mv;
      buffer += toBase(lv(r), r.currency_code);
    }
  }
  return {
    base_currency: BASE_CCY,
    liquidity_value: money(buffer, BASE_CCY),
    market_value_unencumbered: money(mvFree, BASE_CCY),
    market_value_encumbered: money(mvEnc, BASE_CCY),
    weighted_haircut: mvFree > 0 ? (1 - buffer / mvFree).toFixed(4) : "0",
    positions: rows.length,
  };
}

export const liquidAssetsMock = { ...api, summary };
