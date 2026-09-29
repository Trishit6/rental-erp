/**
 * Product filter vocabulary and normalizers.
 *
 * Dependency-free (no DB import) so it can be unit-tested and reused by the
 * route handler and the chat assistant alike.
 */

/** Accepted filter values — the single vocabulary shared with the browse UI. */
export const PRODUCT_CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "USED"] as const;
export const PRODUCT_MODES = ["rent", "buy", "rent-and-buy"] as const;
export const PRODUCT_AVAILABILITY = ["available-now", "for-rent", "for-buy"] as const;
export const PRODUCT_SORTS = [
  "recommended",
  "newest",
  "price_asc",
  "price_desc",
  "rental_asc",
  "most_viewed",
  "most_favorited",
] as const;

export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];
export type ProductMode = (typeof PRODUCT_MODES)[number];
export type ProductAvailability = (typeof PRODUCT_AVAILABILITY)[number];
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/**
 * Expand a comma-separated condition filter into the database vocabulary.
 * "pre-loved" is a browse concept, not a column value — it expands to every used
 * condition, so the DB enum stays the only condition vocabulary. Unknown tokens
 * are dropped rather than erroring, so one bad entry can't blank out the filter.
 */
export function normalizeConditions(raw?: string): ProductCondition[] {
  if (!raw) return [];
  const found = new Set<ProductCondition>();
  for (const token of raw.split(",")) {
    const value = token
      .trim()
      .toUpperCase()
      .replace(/[\s_-]+/g, "_");
    if (!value) continue;
    if (value === "PRE_LOVED") {
      for (const condition of PRODUCT_CONDITIONS) if (condition !== "NEW") found.add(condition);
    } else if ((PRODUCT_CONDITIONS as readonly string[]).includes(value)) {
      found.add(value as ProductCondition);
    }
  }
  return [...found];
}

/** Legacy `type` enum (SALE/RENT/BOTH) → the browse `mode` vocabulary. */
export function normalizeLegacyType(type?: "SALE" | "RENT" | "BOTH"): ProductMode | undefined {
  if (type === "RENT") return "rent";
  if (type === "SALE") return "buy";
  if (type === "BOTH") return "rent-and-buy";
  return undefined;
}

/** Swap a reversed range so `min > max` can never build an impossible query. */
export function normalizePriceRange(min?: number, max?: number) {
  if (min !== undefined && max !== undefined && min > max) {
    return { minPrice: max, maxPrice: min };
  }
  return { minPrice: min, maxPrice: max };
}
