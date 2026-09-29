import { z } from "zod";
import {
  activeProductFilterCount,
  activeProductFilters,
  CLEARED_PRODUCT_FILTERS,
  parseProductSearch,
  PRODUCT_PAGE_SIZE,
  productSearchSchema,
  toProductFilters,
} from "@/lib/product-search/schema";
import type { CategorySearch, CategoryFilters } from "../types";

/* --------------------------------- options ---------------------------------- */

/** Sort keys offered on a category page — the API whitelists exactly these. */
export { SORT_OPTIONS as CATEGORY_SORT_OPTIONS } from "@/lib/product-search/schema";

/** Page size for category results, shared with Browse so grids match. */
export const CATEGORY_PAGE_SIZE = PRODUCT_PAGE_SIZE;

/* -------------------------------- slug schema ------------------------------- */

/**
 * A category slug as it can appear in the route: lowercase words joined by single
 * hyphens. The route param is untrusted input, so it is validated before it ever
 * becomes a request path — the server re-checks existence and activity regardless.
 */
export const categorySlugSchema = z
  .string()
  .trim()
  .min(1, "A category is required.")
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "That isn't a valid category.");

/** Never throws — an unusable route param yields `undefined` instead. */
export function parseCategorySlug(value: unknown): string | undefined {
  const parsed = categorySlugSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/* ------------------------------- search schema ------------------------------ */

/**
 * The URL schema is the shared product-search schema, so Browse and category pages
 * accept (and reject) exactly the same params — including sort and page validation.
 * It is the same object, not a copy, so the two routes can never drift.
 */
export const categorySearchSchema = productSearchSchema;

/**
 * Parse a category page's URL. The category is the *route*, so any `category` param
 * in the query string is dropped: a hand-edited or shared link must never be able to
 * point the results at a category other than the one the page claims to show.
 */
export function parseCategorySearch(input: Record<string, unknown>): CategorySearch {
  return { ...parseProductSearch(input), category: undefined };
}

/** URL state → the request the products API receives, pinned to the route's category. */
export function toCategoryFilters(
  search: CategorySearch,
  categorySlug: string,
  pageSize: number = CATEGORY_PAGE_SIZE,
): CategoryFilters {
  return toProductFilters(search, pageSize, categorySlug);
}

/** Active-filter pills for this page. The category is not a filter — it's the page. */
export function categoryActiveFilters(search: CategorySearch) {
  return activeProductFilters(search);
}

export function categoryActiveFilterCount(search: CategorySearch): number {
  return activeProductFilterCount(search);
}

/** Everything "Clear all" resets on a category page (the search term survives). */
export const CLEARED_CATEGORY_FILTERS = CLEARED_PRODUCT_FILTERS;
