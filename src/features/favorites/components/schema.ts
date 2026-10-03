import { z } from "zod";
import { isPubliclyVisible } from "@/lib/types";
import {
  AVAILABILITY_OPTIONS,
  CONDITION_OPTIONS,
  MODE_OPTIONS,
  oneOf,
  pageNumber,
  text,
} from "@/lib/product-search/schema";
import type { ActiveFavoriteFilter, FavoriteFilters, FavoriteSearch, FavoriteSort } from "../types";

/* --------------------------------- options ---------------------------------- */

/**
 * Sort vocabulary for the wishlist. Deliberately smaller than Browse's list:
 * "recommended" and "most viewed" mean nothing for *your own* saved items, and
 * every option here is one the API can genuinely order by.
 */
export const FAVORITE_SORT_OPTIONS: { value: FavoriteSort; label: string }[] = [
  { value: "recent", label: "Recently added" },
  { value: "oldest", label: "Oldest added" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

export const DEFAULT_FAVORITE_SORT: FavoriteSort = "recent";

/** Page size for the wishlist grid — same rhythm as every other product grid. */
export const FAVORITE_PAGE_SIZE = 12;

const SEARCH_MAX_LENGTH = 120;

const SORT_VALUES = FAVORITE_SORT_OPTIONS.map((option) => option.value);
const MODE_VALUES = MODE_OPTIONS.map((option) => option.value);
const CONDITION_VALUES = CONDITION_OPTIONS.map((option) => option.value);
const AVAILABILITY_VALUES = AVAILABILITY_OPTIONS.map((option) => option.value);

/* --------------------------------- inputs ----------------------------------- */

/**
 * A product id reaches the server straight from a click, so it is constrained
 * before it is ever used. This is a guard rail, not the authority — the backend
 * re-validates and derives ownership from the session.
 */
export const favoriteProductIdSchema = z.coerce.number().int().positive();

/* --------------------------------- schema ----------------------------------- */

export const favoriteSearchSchema = z.object({
  search: text(SEARCH_MAX_LENGTH),
  listingType: oneOf(MODE_VALUES),
  condition: oneOf(CONDITION_VALUES),
  availability: oneOf(AVAILABILITY_VALUES),
  sort: oneOf(SORT_VALUES),
  page: pageNumber(),
});

/**
 * Parse untrusted URL search params into canonical {@link FavoriteSearch}.
 *
 * Reuses the tolerant `text`/`oneOf`/`pageNumber` parsers from
 * `lib/product-search/schema`, so this behaves exactly like Browse's parser:
 * never throws, accepts the numbers TanStack Router hands us, and silently drops
 * anything unusable. A hand-edited `?sort=<script>` cannot break the page.
 */
export function parseFavoriteSearch(input: Record<string, unknown>): FavoriteSearch {
  const parsed = favoriteSearchSchema.safeParse(input);
  const raw = parsed.success ? parsed.data : {};

  return {
    search: raw.search,
    listingType: raw.listingType,
    condition: raw.condition,
    availability: raw.availability,
    sort: raw.sort,
    page: raw.page,
  };
}

/** Drop empty keys so the object serializes to a clean, shareable URL. */
export function toFavoriteUrlSearch(search: FavoriteSearch): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (search.search) out.search = search.search;
  if (search.listingType) out.listingType = search.listingType;
  if (search.condition) out.condition = search.condition;
  if (search.availability) out.availability = search.availability;
  if (search.sort && search.sort !== DEFAULT_FAVORITE_SORT) out.sort = search.sort;
  if (search.page && search.page > 1) out.page = search.page;
  return out;
}

/**
 * URL state → the request the favorites API receives.
 *
 * `listingType` is the client-facing name (it is a *listing* capability, and it
 * matches the spec's URL vocabulary); the API parameter is Browse's `mode`, so
 * the two pages speak the same language to the server.
 */
export function toFavoriteFilters(
  search: FavoriteSearch,
  pageSize: number = FAVORITE_PAGE_SIZE,
): FavoriteFilters {
  return {
    search: search.search,
    listingType: search.listingType,
    condition: search.condition,
    availability: search.availability,
    sort: search.sort ?? DEFAULT_FAVORITE_SORT,
    page: search.page ?? 1,
    pageSize,
  };
}

/* --------------------------------- filters ---------------------------------- */

/** Filters currently narrowing the wishlist — drives the pills and the badge. */
export function activeFavoriteFilters(search: FavoriteSearch): ActiveFavoriteFilter[] {
  const filters: ActiveFavoriteFilter[] = [];

  if (search.listingType) {
    const label =
      MODE_OPTIONS.find((option) => option.value === search.listingType)?.label ??
      search.listingType;
    filters.push({ key: "listingType", label, clear: ["listingType"] });
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
 * Number of active *filters* — excludes `page` (navigation) and `search` (which
 * is a text field with its own clear button, not a filter chip).
 */
export function activeFavoriteFilterCount(search: FavoriteSearch): number {
  return activeFavoriteFilters(search).length;
}

/** What "Clear all" resets. The search term keeps its own clear button. */
export const CLEARED_FAVORITE_FILTERS: Partial<FavoriteSearch> = {
  listingType: undefined,
  condition: undefined,
  availability: undefined,
  sort: undefined,
};

/* ------------------------------- availability ------------------------------- */

/**
 * How available a saved product is, derived from stock the database actually
 * tracks. An archived listing is "unavailable" rather than hidden: a user saving
 * an item is often saving it to wait for it to come back.
 */
export type FavoriteAvailability = "AVAILABLE" | "LIMITED" | "UNAVAILABLE" | "OUT_OF_STOCK";

export function favoriteAvailabilityState(product: {
  status?: string;
  availableQuantity: number;
}): FavoriteAvailability {
  if (product.status && !isPubliclyVisible(product.status)) return "UNAVAILABLE";
  if (product.status === "OUT_OF_STOCK") return "OUT_OF_STOCK";
  if (product.availableQuantity <= 0) return "OUT_OF_STOCK";
  if (product.availableQuantity <= 2) return "LIMITED";
  return "AVAILABLE";
}

const AVAILABILITY_STATE_LABELS: Record<FavoriteAvailability, string> = {
  AVAILABLE: "Available",
  LIMITED: "Limited availability",
  OUT_OF_STOCK: "Out of stock",
  UNAVAILABLE: "Currently unavailable",
};

export function favoriteAvailabilityLabel(state: FavoriteAvailability): string {
  return AVAILABILITY_STATE_LABELS[state];
}

/* ------------------------------- header copy ------------------------------- */

/**
 * The header's supporting line. "Nothing saved yet" is an empty state, not a
 * count of zero — the distinction is the whole point of the copy.
 */
export function favoritesSubtitle(count: number | undefined, isLoading: boolean): string {
  if (isLoading) return "Loading your saved items…";
  if (count === undefined) return "Keep the products you are considering close at hand.";
  if (count === 0) return "Nothing saved yet";
  return `${count} saved ${count === 1 ? "item" : "items"}`;
}

/* ---------------------------------- labels ---------------------------------- */

/** Accessible label for a heart — different for each state, never shared. */
export function favoriteButtonLabel(title: string, favorited: boolean): string {
  return favorited ? `Remove ${title} from favorites` : `Add ${title} to favorites`;
}
