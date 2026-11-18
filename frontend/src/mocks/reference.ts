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
