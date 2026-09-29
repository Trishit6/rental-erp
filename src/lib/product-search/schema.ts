import { z } from "zod";
import { rupeesToPaise } from "../pricing";
import type {
  ActiveFilter,
  ConditionFilterValue,
  ProductAvailability,
  ProductFilters,
  ProductSearch,
  ProductSort,
} from "./types";

/* --------------------------------- options ---------------------------------- */

export const MODE_OPTIONS: {
  value: ProductSearch["mode"] & string;
  label: string;
  hint: string;
}[] = [
  { value: "rent", label: "Rent", hint: "Pay per day" },
  { value: "buy", label: "Buy", hint: "Own it outright" },
  { value: "rent-and-buy", label: "Rent + Buy", hint: "Either works" },
];

export const CONDITION_OPTIONS: { value: ConditionFilterValue; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "LIKE_NEW", label: "Like new" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "USED", label: "Used" },
  { value: "pre-loved", label: "Pre-loved" },
];

export const AVAILABILITY_OPTIONS: { value: ProductAvailability; label: string }[] = [
  { value: "available-now", label: "Available now" },
  { value: "for-rent", label: "Available to rent" },
  { value: "for-buy", label: "Available to buy" },
];

export const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "most_viewed", label: "Most popular" },
  { value: "most_favorited", label: "Most saved" },
  { value: "rental_asc", label: "Rental: Low to High" },
];

export const DEFAULT_SORT: ProductSort = "recommended";

/** Page size every product grid uses, so Browse and category pages agree. */
export const PRODUCT_PAGE_SIZE = 12;

const SEARCH_MAX_LENGTH = 120;
const NAME_MAX_LENGTH = 60;
/** Matches the largest price the products table accepts (10,000,000 paise). */
export const PRICE_MAX_RUPEES = 100_000;

const MODES = MODE_OPTIONS.map((option) => option.value);
const CONDITIONS = CONDITION_OPTIONS.map((option) => option.value);
const AVAILABILITY = AVAILABILITY_OPTIONS.map((option) => option.value);
const SORTS = SORT_OPTIONS.map((option) => option.value);

/* ------------------------------- param parsers ------------------------------ */
/* TanStack Router JSON-parses the query string, so `?page=2` arrives as the
   NUMBER 2 while `?search=tent` arrives as a string. Every parser accepts both
   and degrades to `undefined` instead of throwing, so a hand-edited or hostile
   URL can never crash the page. */

export function text(max: number) {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value): string | undefined => {
      if (value === undefined || value === null) return undefined;
      const trimmed = String(value).trim();
      return trimmed === "" ? undefined : trimmed.slice(0, max);
    });
}

/** Case/separator-insensitive form so `LIKE_NEW`, `like-new` and `like_new` all match. */
export function canonical(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

export function oneOf<T extends string>(values: readonly T[]) {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value): T | undefined => {
      if (value === undefined || value === null) return undefined;
      const normalized = canonical(String(value));
      // Compare canonical forms on BOTH sides — the stored values use underscores.
      return values.find((candidate) => canonical(candidate) === normalized);
    });
}

export function price() {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value): number | undefined => {
      if (value === undefined || value === null || value === "") return undefined;
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return undefined;
      return Math.min(Math.floor(parsed), PRICE_MAX_RUPEES);
    });
}

export function pageNumber() {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value): number | undefined => {
      if (value === undefined || value === null || value === "") return undefined;
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(parsed)) return undefined;
      const page = Math.floor(parsed);
      return page >= 1 ? page : undefined;
    });
}

/* --------------------------------- schema ----------------------------------- */

export const productSearchSchema = z.object({
  search: text(SEARCH_MAX_LENGTH),
  category: text(NAME_MAX_LENGTH),
  subcategory: text(NAME_MAX_LENGTH),
  mode: oneOf(MODES),
  condition: oneOf(CONDITIONS),
  availability: oneOf(AVAILABILITY),
  sort: oneOf(SORTS),
  minPrice: price(),
  maxPrice: price(),
  page: pageNumber(),
  // Legacy aliases keep older/short links working.
  q: text(SEARCH_MAX_LENGTH),
  type: oneOf(["SALE", "RENT", "BOTH"] as const),
});

export type RawProductSearch = z.infer<typeof productSearchSchema>;

const LEGACY_MODE: Record<string, NonNullable<ProductSearch["mode"]>> = {
  SALE: "buy",
  RENT: "rent",
  BOTH: "rent-and-buy",
};

/**
 * Parse untrusted URL search params into canonical {@link ProductSearch}.
 * Never throws: unusable params are dropped and sensible defaults applied.
 *
 * One parser serves Browse and every category page, so the two can never drift
 * into different vocabularies for the same filter (spec: query-cache consistency).
 */
export function parseProductSearch(input: Record<string, unknown>): ProductSearch {
  const parsed = productSearchSchema.safeParse(input);
  const raw: Partial<RawProductSearch> = parsed.success ? parsed.data : {};

  const mode = raw.mode ?? (raw.type ? LEGACY_MODE[raw.type] : undefined);

  // A reversed range is normalized by swapping so it can never build an
  // impossible query (and the user's intent is preserved).
  let { minPrice, maxPrice } = raw;
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  return {
    search: raw.search ?? raw.q,
    category: raw.category,
    subcategory: raw.subcategory,
    mode,
    condition: raw.condition,
    availability: raw.availability,
    sort: raw.sort,
    minPrice,
    maxPrice,
    page: raw.page,
  };
}

/** Drop empty keys so the object serializes to a clean, shareable URL. */
export function toProductUrlSearch(search: ProductSearch): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (search.search) out.search = search.search;
  if (search.category) out.category = search.category;
  if (search.subcategory) out.subcategory = search.subcategory;
  if (search.mode) out.mode = search.mode;
  if (search.condition) out.condition = search.condition;
  if (search.availability) out.availability = search.availability;
  if (search.sort && search.sort !== DEFAULT_SORT) out.sort = search.sort;
  if (search.minPrice !== undefined) out.minPrice = search.minPrice;
  if (search.maxPrice !== undefined) out.maxPrice = search.maxPrice;
  if (search.page && search.page > 1) out.page = search.page;
  return out;
}

/**
 * URL state → the request the products API receives.
 *
 * `categorySlug` lets a category page pin the category to its route param, so a
 * subcategory filter can narrow the results without letting the URL escape the
 * page it belongs to. Prices become paise here and only here.
 */
export function toProductFilters(
  search: ProductSearch,
  pageSize: number = PRODUCT_PAGE_SIZE,
  categorySlug?: string,
): ProductFilters {
  return {
    search: search.search,
    // A subcategory is a category one level down, so it replaces the scope rather
    // than stacking with it — products live in exactly one category row.
    category: search.subcategory ?? categorySlug ?? search.category,
    mode: search.mode,
    condition: search.condition,
    availability: search.availability,
    sort: search.sort ?? DEFAULT_SORT,
    minPrice: search.minPrice !== undefined ? rupeesToPaise(search.minPrice) : undefined,
    maxPrice: search.maxPrice !== undefined ? rupeesToPaise(search.maxPrice) : undefined,
    page: search.page ?? 1,
    pageSize,
  };
}

/** Filters currently narrowing the results — drives the badge count and pills. */
export function activeProductFilters(search: ProductSearch): ActiveFilter[] {
  const filters: ActiveFilter[] = [];

  if (search.category) {
    filters.push({ key: "category", label: search.category, clear: ["category"] });
  }
  if (search.subcategory) {
    filters.push({ key: "subcategory", label: search.subcategory, clear: ["subcategory"] });
  }
  if (search.mode) {
    const label = MODE_OPTIONS.find((option) => option.value === search.mode)?.label ?? search.mode;
    filters.push({ key: "mode", label, clear: ["mode"] });
  }
  if (search.minPrice !== undefined || search.maxPrice !== undefined) {
    const currency = (value: number) => `₹${value.toLocaleString("en-IN")}`;
    const label =
      search.minPrice !== undefined && search.maxPrice !== undefined
        ? `${currency(search.minPrice)} – ${currency(search.maxPrice)}`
        : search.minPrice !== undefined
          ? `From ${currency(search.minPrice)}`
          : `Up to ${currency(search.maxPrice!)}`;
    filters.push({ key: "minPrice", label, clear: ["minPrice", "maxPrice"] });
  }
  if (search.condition) {
    const label =
      CONDITION_OPTIONS.find((option) => option.value === search.condition)?.label ??
      search.condition;
    filters.push({ key: "condition", label, clear: ["condition"] });
  }
  if (search.availability) {
    const label =
      AVAILABILITY_OPTIONS.find((option) => option.value === search.availability)?.label ??
      search.availability;
    filters.push({ key: "availability", label, clear: ["availability"] });
  }

  return filters;
}

/**
 * Number of active *filters* — deliberately excludes `page` (navigation) and
 * `search` (which has its own field, not a filter chip).
 */
export function activeProductFilterCount(search: ProductSearch): number {
  return activeProductFilters(search).length;
}

/**
 * Everything "Clear all" resets. Search is intentionally excluded: the search field
 * has its own clear button, so "Clear all" always means "stop narrowing", never
 * "forget what I'm looking for".
 */
export const CLEARED_PRODUCT_FILTERS: Partial<ProductSearch> = {
  category: undefined,
  subcategory: undefined,
  mode: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  condition: undefined,
  availability: undefined,
  sort: undefined,
};
