/** Liquid assets (securities buffer) API (TECHNICAL_PLAN §4.3). */
import { liquidAssetsMock } from "@/mocks/liquidAssets";
import type { AssetClass, CurrencyCode } from "@/mocks/reference";
import type { Audited, ListQueryParams, Money, Page } from "./types";

export interface LiquidAssetFilters extends ListQueryParams {
  q?: string;
  asset_class?: string;
  currency_code?: string;
  issuer_counterparty_id?: string;
  encumbrance?: "all" | "unencumbered" | "encumbered";
}

export interface LiquidAssetItem {
  id: string;
  security_id: string;
  name: string;
  asset_class: AssetClass;
  currency_code: CurrencyCode;
  issuer_counterparty_id: string | null;
  issuer_name: string | null;
  market_value: Money;
  haircut: string; // fraction
  /** MV x (1 - haircut); zero when encumbered (§5.5). */
  liquidity_value: Money;
  is_encumbered: boolean;
  maturity_date: string;
  version: number;
}

export interface LiquidAsset extends LiquidAssetItem, Omit<Audited, "version"> {
  is_synthetic: boolean;
}

export interface LiquidAssetInput {
  security_id: string;
  name: string;
  asset_class: AssetClass;
  currency_code: CurrencyCode;
  issuer_counterparty_id: string | null;
  market_value: Money;
  haircut: string;
  is_encumbered: boolean;
  maturity_date: string;
}

export interface LiquidAssetSummary {
  base_currency: string;
  liquidity_value: Money;
  market_value_unencumbered: Money;
  market_value_encumbered: Money;
  weighted_haircut: string;
  positions: number;
}

export const liquidAssetsApi = {
  list: (f: LiquidAssetFilters): Promise<Page<LiquidAssetItem>> => liquidAssetsMock.list(f),
  get: (id: string): Promise<LiquidAsset> => liquidAssetsMock.get(id),
  summary: (f: LiquidAssetFilters): Promise<LiquidAssetSummary> => liquidAssetsMock.summary(f),
  create: (input: LiquidAssetInput): Promise<LiquidAsset> => liquidAssetsMock.create(input),
  update: (id: string, patch: Partial<LiquidAssetInput> & { version: number }): Promise<LiquidAsset> => liquidAssetsMock.update(id, patch),
  remove: (id: string, version: number): Promise<void> => liquidAssetsMock.remove(id, version),
  exportCsv: (f: LiquidAssetFilters) => liquidAssetsMock.exportCsv(f),
};
