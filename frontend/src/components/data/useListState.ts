import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { PAGE_SIZES, parseSort, type SortSpec } from "@/api/types";

type Value = string | number | boolean | null | undefined;

/** A fixed default sort, or one that depends on the current URL (e.g. a list "view"). */
export type DefaultSort = string | ((params: URLSearchParams) => string);

/**
 * List state in the URL: search, filters, sort, page, page size and the open
 * record (`?id=`). A list view can be bookmarked, shared and drilled into from
 * other screens; Back closes a record that was opened from the list.
 */
export function useListState(defaultSort: DefaultSort) {
  const [sp, setSp] = useSearchParams();
  const resolveDefault = useCallback((p: URLSearchParams) => (typeof defaultSort === "function" ? defaultSort(p) : defaultSort), [defaultSort]);

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const sizeParam = Number(sp.get("page_size"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : PAGE_SIZES[0];
  const sortRaw = sp.get("sort") ?? resolveDefault(sp);
  const sort = useMemo<SortSpec[]>(() => parseSort(sortRaw), [sortRaw]);

  const get = useCallback((key: string) => sp.get(key) ?? undefined, [sp]);
  const getList = useCallback((key: string) => (sp.get(key) ?? "").split(",").filter(Boolean), [sp]);

  /**
   * Apply a patch. Empty values remove the key. Changing filters returns to
   * page 1 unless `keepPage`. `push` adds a history entry (used to open a record).
   */
  const update = useCallback(
    (patch: Record<string, Value>, opts: { keepPage?: boolean; push?: boolean } = {}) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === null || v === "" || v === false) next.delete(k);
            else next.set(k, String(v));
          }
          if (!opts.keepPage && !("page" in patch)) next.delete("page");
          if (next.get("sort") === resolveDefault(next)) next.delete("sort");
          return next;
        },
        { replace: !opts.push },
      );
    },
    [setSp, resolveDefault],
  );

  return { page, pageSize, sort, sortRaw, get, getList, update, searchParams: sp };
}
