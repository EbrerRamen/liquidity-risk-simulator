/** Currency exposures API (TECHNICAL_PLAN §4.3, A2). */
import { exposuresMock } from "@/mocks/exposures";
import type { CurrencyCode, ExposureType, Position } from "@/mocks/reference";
import type { Audited, ListQueryParams, Money, Page } from "./types";

export interface ExposureFilters extends ListQueryParams {
  q?: string;
  currency_code?: string;
  exposure_type?: string;
  position?: string;
  counterparty_id?: string;
}

export interface ExposureItem {
  id: string;
  currency_code: CurrencyCode;
  exposure_type: ExposureType;
  position: Position;
  exposure_amount: Money;
  value_date: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  description: string;
  /** S_c(T0), computed at read time (never stored). */
  rate: string;
  /** Signed base equivalent: long positive, short negative. */
  base_equivalent: Money;
  version: number;
}

export interface Exposure extends ExposureItem, Omit<Audited, "version"> {
  is_synthetic: boolean;
}

export interface ExposureInput {
  currency_code: CurrencyCode;
  exposure_type: ExposureType;
  position: Position;
  exposure_amount: Money;
  value_date: string | null;
  counterparty_id: string | null;
  description: string;
}

export interface ExposureSummary {
  base_currency: string;
  as_of: string;
  items: { currency_code: string; long: Money; short: Money; net: Money; net_base: Money }[];
  gross_base: Money;
  net_base: Money;
}

export const exposuresApi = {
  list: (f: ExposureFilters): Promise<Page<ExposureItem>> => exposuresMock.list(f),
  get: (id: string): Promise<Exposure> => exposuresMock.get(id),
  summary: (f: ExposureFilters): Promise<ExposureSummary> => exposuresMock.summary(f),
  create: (input: ExposureInput): Promise<Exposure> => exposuresMock.create(input),
  update: (id: string, patch: Partial<ExposureInput> & { version: number }): Promise<Exposure> => exposuresMock.update(id, patch),
  remove: (id: string, version: number): Promise<void> => exposuresMock.remove(id, version),
  exportCsv: (f: ExposureFilters) => exposuresMock.exportCsv(f),
};
