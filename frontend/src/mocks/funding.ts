/** Mock of /funding-sources (TECHNICAL_PLAN §4.3), with the A3 rules for deposits vs lines. */
import type { FundingFilters, FundingInput, FundingListItem, FundingSource, FundingSummary } from "@/api/funding";
import { crud, csvIn, decimalPlaces, isDec, isIsoDate, type FieldError } from "./crud";
import { db, type FundingSourceRecord } from "./db";
import { latency } from "./latency";
import { BASE_CCY, businessDate, cpName, money, toBase } from "./lookup";
import { CURRENCY_LIST, FUNDING_TYPES, isDepositPool, type FundingType } from "./reference";
import { requireUser } from "./server";

const LINE_TYPES: FundingType[] = ["COMMITTED_LINE", "UNCOMMITTED_LINE", "REPO_FACILITY"];
const hasHeadroom = (t: FundingType) => !isDepositPool(t);

function treatment(t: FundingType): FundingListItem["liquidity_treatment"] {
  if (isDepositPool(t)) return "FUNDING";
  return t === "COMMITTED_LINE" ? "HEADROOM_IF_INCLUDED" : "MEMO";
}

function toItem(r: FundingSourceRecord): FundingListItem {
  const avail = Number(r.available_amount);
  const used = Number(r.utilized_amount);
  return {
    id: r.id,
    name: r.name,
    funding_type: r.funding_type,
    currency_code: r.currency_code,
    counterparty_id: r.counterparty_id,
    counterparty_name: cpName(r.counterparty_id),
    available_amount: r.available_amount,
    utilized_amount: r.utilized_amount,
    headroom: hasHeadroom(r.funding_type) ? money(avail - used, r.currency_code) : null,
    utilization: hasHeadroom(r.funding_type) && avail > 0 ? (used / avail).toFixed(4) : null,
    maturity_date: r.maturity_date,
    liquidity_treatment: treatment(r.funding_type),
    version: r.version,
  };
}

const api = crud<FundingSourceRecord, FundingFilters, FundingListItem, FundingSource, FundingInput>({
  base: "/api/v1/funding-sources",
  entity: "funding source",
  idPrefix: "fs",
  table: () => db().fundingSources,
  setTable: (rows) => (db().fundingSources = rows),
  label: (r) => r.name,
  filter: (rows, f) => {
    const q = f.q?.trim().toLowerCase();
    const types = csvIn(f.funding_type);
    const ccys = csvIn(f.currency_code);
    const cps = csvIn(f.counterparty_id);
    return rows.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || (cpName(r.counterparty_id) ?? "").toLowerCase().includes(q)) &&
        (!types.length || types.includes(r.funding_type)) &&
        (!ccys.length || ccys.includes(r.currency_code)) &&
        (!cps.length || (r.counterparty_id !== null && cps.includes(r.counterparty_id))),
    );
  },
  sorters: {
    name: (r) => r.name,
    funding_type: (r) => FUNDING_TYPES.indexOf(r.funding_type),
    currency_code: (r) => r.currency_code,
    available_amount: (r) => toBase(r.available_amount, r.currency_code),
    utilized_amount: (r) => toBase(r.utilized_amount, r.currency_code),
    headroom: (r) => (hasHeadroom(r.funding_type) ? toBase(Number(r.available_amount) - Number(r.utilized_amount), r.currency_code) : -1),
    maturity_date: (r) => r.maturity_date ?? "9999",
  },
  defaultSort: [{ field: "funding_type", dir: "asc" }, { field: "name", dir: "asc" }],
  toItem,
  toEntity: (r) => ({ ...toItem(r), is_synthetic: r.is_synthetic, created_at: r.created_at, updated_at: r.updated_at, created_by: r.created_by, updated_by: r.updated_by }),
  editable: ["name", "funding_type", "currency_code", "counterparty_id", "available_amount", "utilized_amount", "maturity_date"],
  normalize: (input) => {
    const out: Partial<FundingInput> = { ...input };
    if (typeof out.name === "string") out.name = out.name.trim();
    // Deposit pools: available = utilised = balance, no single provider (A3).
    if (out.funding_type && isDepositPool(out.funding_type)) {
      out.counterparty_id = null;
      if (out.available_amount !== undefined) out.utilized_amount = out.available_amount;
    }
    return out;
  },
  validate: (i) => {
    const e: FieldError[] = [];
    if (!i.name || i.name.length < 2) e.push({ field: "name", message: "must be at least 2 characters" });
    if (i.name && i.name.length > 120) e.push({ field: "name", message: "must be at most 120 characters" });
    if (!FUNDING_TYPES.includes(i.funding_type)) e.push({ field: "funding_type", message: "choose a type" });
    if (!CURRENCY_LIST.includes(i.currency_code)) e.push({ field: "currency_code", message: "choose a currency" });
    const dp = i.currency_code === "JPY" ? 0 : 2;
    if (!isDec(i.available_amount) || Number(i.available_amount) < 0) e.push({ field: "available_amount", message: "enter an amount of zero or more" });
    else if (decimalPlaces(i.available_amount) > dp) e.push({ field: "available_amount", message: `use at most ${dp} decimal places for ${i.currency_code}` });
    if (!isDepositPool(i.funding_type)) {
      if (!isDec(i.utilized_amount) || Number(i.utilized_amount) < 0) e.push({ field: "utilized_amount", message: "enter an amount of zero or more" });
      else if (isDec(i.available_amount) && Number(i.utilized_amount) > Number(i.available_amount)) e.push({ field: "utilized_amount", message: "can't exceed the limit" });
      if (LINE_TYPES.includes(i.funding_type) && !i.counterparty_id) e.push({ field: "counterparty_id", message: "choose the provider of this line" });
    }
    if (i.counterparty_id && !db().counterparties.some((c) => c.id === i.counterparty_id)) e.push({ field: "counterparty_id", message: "unknown counterparty" });
    if (i.maturity_date && (!isIsoDate(i.maturity_date) || i.maturity_date <= businessDate())) e.push({ field: "maturity_date", message: "must be after the business date" });
    return e;
  },
  duplicates: (i, existing) =>
    db().fundingSources.some((r) => r.id !== existing?.id && r.name.toLowerCase() === i.name.toLowerCase())
      ? [{ field: "name", message: "A funding source with this name already exists" }]
      : [],
  build: (i, { id, user, now }) => ({
    id,
    ...i,
    counterparty_id: i.counterparty_id ?? null,
    maturity_date: i.maturity_date ?? null,
    is_synthetic: false,
    version: 1,
    created_at: now,
    updated_at: now,
    created_by: user.name,
    updated_by: user.name,
  }),
  csv: {
    name: "funding_sources",
    header: ["id", "name", "funding_type", "currency_code", "counterparty", "available_amount", "utilized_amount", "headroom", "maturity_date"],
    row: (r) => {
      const it = toItem(r);
      return [r.id, r.name, r.funding_type, r.currency_code, it.counterparty_name, r.available_amount, r.utilized_amount, it.headroom, r.maturity_date];
    },
  },
});

/** Funding mix in base currency for the summary strip (§5.10 funding dependency). */
async function summary(f: FundingFilters): Promise<FundingSummary> {
  await latency(200, 400);
  requireUser("VIEWER");
  const rows = (await api.list({ ...f, page: 1, page_size: 200 })).items;
  let deposits = 0;
  let wholesale = 0;
  let committedHeadroom = 0;
  let memoCapacity = 0;
  for (const r of rows) {
    const used = toBase(r.utilized_amount, r.currency_code);
    const room = r.headroom === null ? 0 : toBase(r.headroom, r.currency_code);
    if (isDepositPool(r.funding_type)) deposits += used;
    else wholesale += used;
    if (r.funding_type === "COMMITTED_LINE") committedHeadroom += room;
    else memoCapacity += room;
  }
  const total = deposits + wholesale;
  return {
    base_currency: BASE_CCY,
    total_funding: money(total, BASE_CCY),
    deposits: money(deposits, BASE_CCY),
    drawn_lines: money(wholesale, BASE_CCY),
    deposit_share: total > 0 ? (deposits / total).toFixed(4) : "0",
    committed_headroom: money(committedHeadroom, BASE_CCY),
    memo_capacity: money(memoCapacity, BASE_CCY),
    sources: rows.length,
  };
}

export const fundingMock = { ...api, summary };
