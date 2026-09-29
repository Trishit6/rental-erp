import type {
  Category,
  CategoryDetail,
  ListingMode,
  ProductCardData,
  ProductSort,
} from "@/lib/types";
import type { ProductFilters, ProductSearch } from "@/lib/product-search/types";

/* The canonical shapes live outside the feature (shared vocabulary rule), so a
   shared component or another feature's page can consume them. These names are the
   category-domain names for those shapes — never a second definition. */
export type { Category, CategoryDetail, ListingMode };

/** A category tile/header's data. Counts come from the API — never derived here. */
export type CategorySummary = Category;

/** A category's child. Same shape, one level down in the tree. */
export type Subcategory = Category;

/** One listing inside a category — the shared card shape, never redefined. */
export type CategoryProduct = ProductCardData;

/** Sort keys the products API whitelists. */
export type CategorySort = ProductSort;

/**
 * URL-serializable category-page state: the shared product search scoped to the
 * category in the route. `subcategory` is the in-page narrowing; `category` is
 * always the route param, so the parser drops any `?category=` from the URL.
 */
export type CategorySearch = ProductSearch;

/** Normalized request `GET /api/products` receives for a category page. */
export type CategoryFilters = ProductFilters;
