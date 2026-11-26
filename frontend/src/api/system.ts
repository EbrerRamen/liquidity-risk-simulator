/**
 * System API (TECHNICAL_PLAN §4.3): GET /system/info for every signed-in user,
 * GET and PATCH /system/settings for admins. The settings row holds the
 * simulation business date (A8) and the minimum liquidity buffer (§5.8).
 */
import type { SystemInfo } from "@/app/session";
import { systemMock } from "@/mocks/system";
import type { Money } from "./types";

export interface AppSettings {
  /** T0 for every as-of calculation. A business day. */
  business_date: string;
  /** Fixed at seeding: changing it needs a re-seed. */
  base_currency: string;
  /** B_min, in the base currency (§5.8). */
  min_liquidity_buffer: Money;
  /** Default for "include committed facilities" in liquidity analysis and stress runs (§5.5). */
  include_facilities_default: boolean;
  /** Earliest date the business date can move back to: the latest date with recorded activity. */
  earliest_business_date: string;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

export interface AppSettingsPatch {
  business_date?: string;
  min_liquidity_buffer?: Money;
  include_facilities_default?: boolean;
  version: number;
}

export const systemApi = {
  info: async (): Promise<SystemInfo> => {
    const d = await systemMock.info();
    return { version: d.version, businessDate: d.business_date, baseCurrency: d.base_currency, synthetic: d.synthetic, llmAvailable: d.llm_available };
  },
  settings: (): Promise<AppSettings> => systemMock.getSettings(),
  updateSettings: (patch: AppSettingsPatch): Promise<AppSettings> => systemMock.updateSettings(patch),
};
