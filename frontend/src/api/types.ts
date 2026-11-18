/**
 * Shared API contract shapes (TECHNICAL_PLAN §4.1). Once the backend exists these
 * are generated from OpenAPI; until then they are written by hand to match.
 */

/** Money and rates travel as decimal strings to keep Decimal precision. */
export type Money = string;

/** List response: `{ items, total, page, page_size }`. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type SortDir = "asc" | "desc";

/** `?sort=-updated_at,name` → [{ field: "updated_at", dir: "desc" }, { field: "name", dir: "asc" }]. */
export interface SortSpec {
  field: string;
  dir: SortDir;
}

export function parseSort(raw: string | null | undefined): SortSpec[] {
  if (!raw) return [];
  return raw
    .split(",")
    .filter(Boolean)
    .map((s) => (s.startsWith("-") ? { field: s.slice(1), dir: "desc" as const } : { field: s, dir: "asc" as const }));
}

export function formatSort(specs: SortSpec[]): string {
  return specs.map((s) => (s.dir === "desc" ? "-" : "") + s.field).join(",");
}

/** Common list query parameters: `?page=1&page_size=50&sort=-maturity_date`. */
export interface ListQueryParams {
  page?: number;
  page_size?: number;
  sort?: string;
}

export const PAGE_SIZES = [25, 50, 100] as const;
export const MAX_PAGE_SIZE = 200;

/** Audit metadata every mutable entity carries (§3.1). */
export interface Audited {
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}
