import type { Pagination } from "../api/client";
import type {
  ListingMode,
  ProductAvailability,
  ProductCardData,
  ProductCondition,
  ProductSort,
} from "../types";

/* Product filter vocabulary is shared, never redefined: the words live in
   `lib/types.ts`, the URL/request shapes generated from them live here. */
export type { ListingMode, ProductAvailability, ProductCondition, ProductSort };

/**
 * The condition filter value. Every value except `pre-loved` is a real database
 * enum member; `pre-loved` is a UI shortcut the API expands to the used
 * conditions, so no second condition vocabulary is introduced.
 */
export type ConditionFilterValue = ProductCondition | "pre-loved";

/**
 * URL-serializable product-search state — the single source of truth for Browse
 * and for a category page's results.
 *
 * `category` scopes to a category slug and is what Browse's category filter sets.
 * `subcategory` is the same idea one level down, used by category pages; a given
 * page only ever sets one of the two, which is why they can share one type and one
 * parser. All prices are **rupees** (the API receives paise).
 */
export type ProductSearch = {
  search?: string;
  category?: string;
  subcategory?: string;
  mode?: ListingMode;
  condition?: ConditionFilterValue;
  availability?: ProductAvailability;
  sort?: ProductSort;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
};

/** Normalized request `GET /api/products` receives. Prices are paise. */
export type ProductFilters = {
  search?: string;
  category?: string;
  mode?: ListingMode;
  condition?: ConditionFilterValue;
  availability?: ProductAvailability;
  sort: ProductSort;
  minPrice?: number;
  maxPrice?: number;
  page: number;
  pageSize: number;
};

/** One listing in a product result — the shared card shape, never redefined. */
export type ProductListItem = ProductCardData;

export type ProductListResponse = {
  items: ProductListItem[];
  pagination: Pagination;
};

/** A single active-filter pill. */
export type ActiveFilter = {
  key: keyof ProductSearch;
  label: string;
  /** Search keys this pill removes — price clears both of its bounds at once. */
  clear: (keyof ProductSearch)[];
};
