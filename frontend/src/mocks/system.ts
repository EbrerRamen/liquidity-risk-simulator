/**
 * Mock of GET /system/info and GET/PATCH /system/settings (TECHNICAL_PLAN §4.3).
 * The settings row lives in the mock database, so every mock endpoint reads
 * the business date and buffer from it (db.ts, businessDate()).
 */
import type { AppSettings, AppSettingsPatch } from "@/api/system";
import type { SessionUser } from "@/app/session";
import { decimalPlaces, isDec, isIsoDate, type FieldError } from "./crud";
import { audit, commit, db, nowIso, type SettingsRecord } from "./db";
import { latency } from "./latency";
import { fmtDate } from "./lookup";
import { isBusinessDay } from "./schedule";
import { problem, requireUser } from "./server";

/** Shown on the sign-in page, before there is a session to ask /system/info with. */
export const MOCK_APP_VERSION = "0.1.0";

export interface SystemInfoDto {
  version: string;
  business_date: string;
  base_currency: string;
  synthetic: boolean;
  llm_available: boolean;
}

const BASE = "/api/v1/system/settings";

/**
 * The business date can't move back past recorded activity: a settlement,
 * deal, FX rate, rating change or cash-account anchor dated after it would
 * sit in the future. The latest such date is the earliest allowed T0.
 */
function latestActivity(): { date: string; what: string } {
  const d = db();
  let best = { date: "0000-01-01", what: "" };
  const consider = (date: string | null | undefined, what: string) => {
    if (date && date > best.date) best = { date, what };
  };
  for (const f of d.cashFlows) if (f.status === "SETTLED") consider(f.actual_date, "a settled cash flow");
  for (const x of d.deals) consider(x.deal_date, "a deal booking");
  for (const r of d.fxRates) consider(r.rate_date, "an FX rate");
  for (const r of d.ratingHistory) consider(r.effective_date, "a rating change");
  for (const a of d.cashAccounts) consider(a.opening_date, "a cash account opening balance");
  return best;
}

function toSettings(s: SettingsRecord): AppSettings {
  return {
    business_date: s.business_date,
    base_currency: s.base_currency,
    min_liquidity_buffer: s.min_liquidity_buffer,
    include_facilities_default: s.include_facilities_default,
    earliest_business_date: latestActivity().date,
    version: s.version,
    updated_at: s.updated_at,
    updated_by: s.updated_by,
  };
}

function validate(next: SettingsRecord, current: SettingsRecord): FieldError[] {
  const e: FieldError[] = [];
  if (next.business_date !== current.business_date) {
    const floor = latestActivity();
    if (!isIsoDate(next.business_date)) e.push({ field: "business_date", message: "enter a date" });
    else if (!isBusinessDay(next.business_date)) e.push({ field: "business_date", message: `${fmtDate(next.business_date)} is a weekend; choose a business day` });
    else if (next.business_date < floor.date) e.push({ field: "business_date", message: `can't be before ${fmtDate(floor.date)}, when ${floor.what} is recorded` });
  }
  if (!isDec(next.min_liquidity_buffer) || next.min_liquidity_buffer.startsWith("-")) e.push({ field: "min_liquidity_buffer", message: "enter an amount of zero or more" });
  else if (decimalPlaces(next.min_liquidity_buffer) > 2) e.push({ field: "min_liquidity_buffer", message: "use at most 2 decimal places" });
  if (typeof next.include_facilities_default !== "boolean") e.push({ field: "include_facilities_default", message: "must be on or off" });
  return e;
}

function describe(diff: Record<string, [unknown, unknown]>): string {
  const parts: string[] = [];
  const date = diff.business_date as [string, string] | undefined;
  if (date) parts.push(`moved the business date from ${fmtDate(date[0])} to ${fmtDate(date[1])}`);
  if (diff.min_liquidity_buffer) parts.push("changed the minimum liquidity buffer");
  if (diff.include_facilities_default) parts.push(`${diff.include_facilities_default[1] ? "included" : "excluded"} committed facilities by default`);
  const s = parts.join("; ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const systemMock = {
  async info(): Promise<SystemInfoDto> {
    await latency(80, 180);
    requireUser("VIEWER", "/api/v1/system/info");
    const s = db().settings;
    return { version: MOCK_APP_VERSION, business_date: s.business_date, base_currency: s.base_currency, synthetic: true, llm_available: false };
  },

  async getSettings(): Promise<AppSettings> {
    await latency(200, 400);
    requireUser("ADMIN", BASE);
    return toSettings(db().settings);
  },

  async updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    await latency(400, 800);
    const user: SessionUser = requireUser("ADMIN", BASE);
    const current = db().settings;
    if (patch.version !== current.version) {
      throw problem(409, "conflict", "Changed by someone else", `The settings were changed${current.updated_by ? ` by ${current.updated_by}` : ""} after you opened them.`, {}, BASE);
    }
    const { version: _v, ...changes } = patch;
    const given = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    const next: SettingsRecord = { ...current, ...given };
    const errors = validate(next, current);
    if (errors.length) throw problem(422, "validation", "Validation failed", errors.map((x) => `${x.field} ${x.message}`).join("; "), { errors }, BASE);

    const diff: Record<string, [unknown, unknown]> = {};
    for (const k of ["business_date", "min_liquidity_buffer", "include_facilities_default"] as const) {
      if (next[k] !== current[k]) diff[k] = [current[k], next[k]];
    }
    if (Object.keys(diff).length) {
      db().settings = { ...next, version: current.version + 1, updated_at: nowIso(), updated_by: user.name };
      audit({ actor: user, action: "UPDATE", entity_type: "settings", entity_id: "1", summary: describe(diff), changes: diff });
      commit();
    }
    return toSettings(db().settings);
  },
};
