/**
 * Reference data: GET /countries, GET /currencies and fixed enumerations
 * (TECHNICAL_PLAN §3.2). Countries are ISO 3166-1 alpha-2; "XV" is a
 * user-assigned code for the fictional Republic of Valoria.
 */

export interface Country {
  code: string;
  name: string;
  risk_tier: number; // 1-5, synthetic
}

export const COUNTRIES: Country[] = [
  { code: "AU", name: "Australia", risk_tier: 1 },
  { code: "CA", name: "Canada", risk_tier: 1 },
  { code: "CH", name: "Switzerland", risk_tier: 1 },
  { code: "DE", name: "Germany", risk_tier: 1 },
  { code: "FR", name: "France", risk_tier: 1 },
  { code: "GB", name: "United Kingdom", risk_tier: 1 },
  { code: "IE", name: "Ireland", risk_tier: 2 },
  { code: "JP", name: "Japan", risk_tier: 1 },
  { code: "LU", name: "Luxembourg", risk_tier: 1 },
  { code: "LV", name: "Latvia", risk_tier: 3 },
  { code: "NL", name: "Netherlands", risk_tier: 1 },
  { code: "NO", name: "Norway", risk_tier: 1 },
  { code: "SG", name: "Singapore", risk_tier: 1 },
  { code: "US", name: "United States", risk_tier: 1 },
  { code: "XV", name: "Valoria (fictional)", risk_tier: 4 },
];

export const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;

export const COUNTERPARTY_TYPES = ["BANK", "CENTRAL_BANK", "SOVEREIGN", "CORPORATE", "NBFI", "FUND"] as const;
export type CounterpartyType = (typeof COUNTERPARTY_TYPES)[number];

export const COUNTERPARTY_TYPE_LABEL: Record<CounterpartyType, string> = {
  BANK: "Bank",
  CENTRAL_BANK: "Central bank",
  SOVEREIGN: "Sovereign",
  CORPORATE: "Corporate",
  NBFI: "Non-bank financial",
  FUND: "Fund",
};

/** Long-term rating scale, best to worst. */
export const RATINGS = [
  "AAA", "AA+", "AA", "AA-", "A+", "A", "A-",
  "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-",
  "CCC", "CC", "C", "D",
] as const;
export type Rating = (typeof RATINGS)[number];

/** Investment grade is BBB- or better. */
export const isInvestmentGrade = (r: Rating) => RATINGS.indexOf(r) <= RATINGS.indexOf("BBB-");

export const BANDS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Band = (typeof BANDS)[number];

export const BAND_LABEL: Record<Band, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };

/* ---------- currencies ---------- */

export const CURRENCY_LIST = ["USD", "EUR", "GBP", "JPY", "CHF", "AUD", "SGD"] as const;
export type CurrencyCode = (typeof CURRENCY_LIST)[number];

export const CURRENCY_NAME: Record<CurrencyCode, string> = {
  USD: "US dollar",
  EUR: "Euro",
  GBP: "Pound sterling",
  JPY: "Japanese yen",
  CHF: "Swiss franc",
  AUD: "Australian dollar",
  SGD: "Singapore dollar",
};

/* ---------- money-market deals ---------- */

export const DEAL_TYPES = ["TERM_DEPOSIT", "OVERNIGHT", "REPO", "CD", "CP"] as const;
export type DealType = (typeof DEAL_TYPES)[number];
export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  TERM_DEPOSIT: "Term deposit",
  OVERNIGHT: "Overnight",
  REPO: "Repo",
  CD: "Certificate of deposit",
  CP: "Commercial paper",
};

export const DEAL_STATUSES = ["PENDING", "SETTLED", "MATURED", "CANCELLED", "FAILED"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];
export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  PENDING: "Pending",
  SETTLED: "Live",
  MATURED: "Matured",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

export const FREQUENCIES = ["AT_MATURITY", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL"] as const;
export type InterestFrequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABEL: Record<InterestFrequency, string> = {
  AT_MATURITY: "At maturity",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Semi-annual",
};

export const DAY_COUNTS = ["ACT_360", "ACT_365F"] as const;
export type DayCountCode = (typeof DAY_COUNTS)[number];
export const DAY_COUNT_LABEL: Record<DayCountCode, string> = { ACT_360: "ACT/360", ACT_365F: "ACT/365F" };

/* ---------- cash flows ---------- */

export const CF_CATEGORIES = ["PRINCIPAL", "INTEREST", "DEPOSIT", "CUSTOMER", "PAYROLL", "TAX", "COUPON", "FEE", "OTHER"] as const;
export type CashFlowCategory = (typeof CF_CATEGORIES)[number];
export const CF_CATEGORY_LABEL: Record<CashFlowCategory, string> = {
  PRINCIPAL: "Principal",
  INTEREST: "Interest",
  DEPOSIT: "Deposit",
  CUSTOMER: "Customer",
  PAYROLL: "Payroll",
  TAX: "Tax",
  COUPON: "Coupon",
  FEE: "Fee",
  OTHER: "Other",
};
/** Principal and interest come from deal schedules, not manual entry. */
export const MANUAL_CF_CATEGORIES = CF_CATEGORIES.filter((c) => c !== "PRINCIPAL" && c !== "INTEREST");

export const CF_SOURCES = ["DEAL_SCHEDULE", "MANUAL", "SYNTHETIC"] as const;
export type CashFlowSource = (typeof CF_SOURCES)[number];
export const CF_SOURCE_LABEL: Record<CashFlowSource, string> = { DEAL_SCHEDULE: "Deal schedule", MANUAL: "Manual", SYNTHETIC: "Synthetic" };

export const CF_STATUSES = ["PROJECTED", "SETTLED", "FAILED", "CANCELLED"] as const;
export type CashFlowStatus = (typeof CF_STATUSES)[number];

/* ---------- funding sources ---------- */

export const FUNDING_TYPES = [
  "RETAIL_DEPOSITS",
  "CORPORATE_DEPOSITS",
  "COMMITTED_LINE",
  "UNCOMMITTED_LINE",
  "REPO_FACILITY",
  "CENTRAL_BANK_FACILITY",
] as const;
export type FundingType = (typeof FUNDING_TYPES)[number];
export const FUNDING_TYPE_LABEL: Record<FundingType, string> = {
  RETAIL_DEPOSITS: "Retail deposits",
  CORPORATE_DEPOSITS: "Corporate deposits",
  COMMITTED_LINE: "Committed line",
  UNCOMMITTED_LINE: "Uncommitted line",
  REPO_FACILITY: "Repo facility",
  CENTRAL_BANK_FACILITY: "Central bank facility",
};
/** Deposit pools: available = utilised = balance, no headroom, no single provider (A3). */
export const isDepositPool = (t: FundingType) => t === "RETAIL_DEPOSITS" || t === "CORPORATE_DEPOSITS";

/* ---------- liquid assets ---------- */

export const ASSET_CLASSES = ["GOVT_BOND", "SUPRANATIONAL", "COVERED_BOND", "CORPORATE_BOND"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];
export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  GOVT_BOND: "Government bond",
  SUPRANATIONAL: "Supranational",
  COVERED_BOND: "Covered bond",
  CORPORATE_BOND: "Corporate bond",
};
/** Illustrative default haircuts (§5.5). Editable per position; not regulatory HQLA haircuts. */
export const DEFAULT_HAIRCUT: Record<AssetClass, string> = {
  GOVT_BOND: "0.02",
  SUPRANATIONAL: "0.05",
  COVERED_BOND: "0.15",
  CORPORATE_BOND: "0.25",
};

/* ---------- cash accounts ---------- */

export const ACCOUNT_TYPES = ["NOSTRO", "CENTRAL_BANK_RESERVE"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = { NOSTRO: "Nostro", CENTRAL_BANK_RESERVE: "Central bank reserve" };

/* ---------- currency exposures ---------- */

export const EXPOSURE_TYPES = ["FX_SPOT", "FX_FORWARD", "OFF_BALANCE_SHEET", "OTHER"] as const;
export type ExposureType = (typeof EXPOSURE_TYPES)[number];
export const EXPOSURE_TYPE_LABEL: Record<ExposureType, string> = {
  FX_SPOT: "FX spot",
  FX_FORWARD: "FX forward",
  OFF_BALANCE_SHEET: "Off-balance sheet",
  OTHER: "Other",
};
export const POSITIONS = ["LONG", "SHORT"] as const;
export type Position = (typeof POSITIONS)[number];
