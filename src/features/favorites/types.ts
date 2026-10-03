import type { Pagination } from "@/lib/api/client";
import type {
  ConditionFilterValue,
  ListingMode,
  ProductAvailability,
} from "@/lib/product-search/types";
import type { ProductCardData } from "@/lib/types";

/**
 * Favourites types.
 *
 * Product shapes are re-used from `lib/types` (never redefined) and the filter
 * vocabulary from `lib/product-search` — the same words Browse uses, so a user
 * switching between the two pages never has to relearn anything.
 */

export type { ConditionFilterValue, ListingMode, ProductAvailability };

/**
 * The relationship row exactly as the `favorites` table stores it. The server
 * derives `userId` from the session, so it is never something a client sends.
 */
export type Favorite = {
  id: number;
  userId: number;
  productId: number;
  createdAt: string;
};

/**
 * A saved product as the list endpoint returns it: the same card every other
 * grid renders, plus *this* favourite's own id and when the user saved it.
 */
export type FavoriteProduct = ProductCardData & {
  favoriteId: number;
  savedAt: string;
  isFavorited: true;
};

export type FavoriteListResponse = {
  items: FavoriteProduct[];
  pagination: Pagination;
};

/**
 * URL state for `/favorites` — the single source of truth for the page, so
 * refresh, back/forward and a shared link all reproduce the same view.
 */
export type FavoriteSearch = {
  search?: string;
  listingType?: ListingMode;
  condition?: ConditionFilterValue;
  availability?: ProductAvailability;
  sort?: FavoriteSort;
  page?: number;
};

/** The normalized request `GET /api/favorites` receives. */
export type FavoriteFilters = {
  search?: string;
  listingType?: ListingMode;
  condition?: ConditionFilterValue;
  availability?: ProductAvailability;
  sort: FavoriteSort;
  page: number;
  pageSize: number;
};

/**
 * Sort keys — and only keys the endpoint can order by correctly. There is no
 * "price" sort here that ignores the other prices, so nothing is ever sorted on
 * an incomplete field.
 */
export type FavoriteSort = "recent" | "oldest" | "price_asc" | "price_desc";

/** What the add/remove/clear endpoints answer with. */
export type FavoriteMutationResult = {
  productId: number;
  favorited: boolean;
};

export type FavoriteClearResult = {
  cleared: number;
};

/** A single active-filter pill on the wishlist toolbar. */
export type ActiveFavoriteFilter = {
  key: keyof FavoriteSearch;
  label: string;
  /** Search keys this pill removes. */
  clear: (keyof FavoriteSearch)[];
};
