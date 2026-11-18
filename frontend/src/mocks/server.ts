/**
 * Helpers that make mock endpoints behave like the real API: problem+json
 * errors, role checks, list paging/sorting, CSV encoding.
 */
import { ApiError, type Problem } from "@/api/problem";
import { MAX_PAGE_SIZE, parseSort, type Page, type SortSpec } from "@/api/types";
import { hasRole, type Role, type SessionUser } from "@/app/session";
import { mockCurrentUser } from "./auth";
import { mockRequestId } from "./latency";

export function problem(status: number, slug: string, title: string, detail: string, extra: Partial<Problem> = {}, instance?: string): ApiError {
  return new ApiError({
    type: `https://lrs.local/problems/${slug}`,
    title,
    status,
    detail,
    instance,
    request_id: mockRequestId(),
    ...extra,
  });
}

/** Resolve the caller and enforce the role matrix (§4.2), as router dependencies will. */
export function requireUser(role: Role = "VIEWER", instance?: string): SessionUser {
  const user = mockCurrentUser();
  if (!user) throw problem(401, "unauthenticated", "Not signed in", "Sign in to continue.", {}, instance);
  if (!hasRole(user.role, role)) {
    throw problem(403, "forbidden", "Not allowed", `This action needs the ${role === "ADMIN" ? "Admin" : "Risk analyst"} role.`, {}, instance);
  }
  return user;
}

export interface ListQuery {
  page?: number;
  page_size?: number;
  sort?: string;
}

/** Sort by allow-listed fields only (an unknown field is a 422, as on the API). Ties break on id. */
export function sortRows<T extends { id: string }>(
  rows: T[],
  sort: string | undefined,
  sorters: Record<string, (row: T) => string | number>,
  defaultSort: SortSpec[],
  instance: string,
): T[] {
  const specs = sort ? parseSort(sort) : defaultSort;
  for (const s of specs) {
    if (!sorters[s.field]) {
      throw problem(422, "validation", "Validation failed", `Cannot sort by "${s.field}".`, {
        errors: [{ field: "sort", message: `allowed: ${Object.keys(sorters).join(", ")}` }],
      }, instance);
    }
  }
  return [...rows].sort((a, b) => {
    for (const s of specs) {
      const fa = sorters[s.field]!(a);
      const fb = sorters[s.field]!(b);
      const c = typeof fa === "number" && typeof fb === "number" ? fa - fb : String(fa).localeCompare(String(fb), "en", { sensitivity: "base" });
      if (c !== 0) return s.dir === "desc" ? -c : c;
    }
    return a.id.localeCompare(b.id);
  });
}

/** Sort, then slice one page. Out-of-range pages clamp to the last page. */
export function paginate<T extends { id: string }>(
  rows: T[],
  q: ListQuery,
  sorters: Record<string, (row: T) => string | number>,
  defaultSort: SortSpec[],
  instance: string,
): Page<T> {
  const sorted = sortRows(rows, q.sort, sorters, defaultSort, instance);
  const page_size = Math.min(Math.max(1, q.page_size ?? 25), MAX_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(sorted.length / page_size));
  const page = Math.min(Math.max(1, q.page ?? 1), pages);
  return { items: sorted.slice((page - 1) * page_size, page * page_size), total: sorted.length, page, page_size };
}

/** RFC 4180 CSV: quote fields containing commas, quotes or line breaks; neutralise spreadsheet formulas. */
export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const cell = (v: string | number | boolean | null) => {
    let s = v === null ? "" : String(v);
    // CSV injection guard: a leading = + - @ would run as a formula in a spreadsheet.
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const csvList = (raw: string | undefined) => (raw ? raw.split(",").filter(Boolean) : []);
