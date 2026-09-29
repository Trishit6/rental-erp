import { api, type Pagination } from "@/lib/api/client";
import type {
  FavoriteFilters,
  FavoriteListResponse,
  FavoriteMutationResult,
  FavoriteProduct,
} from "./types";

/**
 * Every network call the favourites feature makes. Nothing here touches the
 * store — components call the hooks in `./query` (or the shared hooks in
 * `lib/query/favorites`) and never this file directly.
 *
 * `userId` is never sent: the API derives the owner from the session cookie, so
 * a client cannot address another user's favourites even if it tried.
 */

/** Map the wishlist's filter vocabulary onto the API's (Browse-compatible) names. */
function toQueryString(filters: FavoriteFilters): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  };

  set("search", filters.search);
  // `listingType` on the wire is `mode` — the same parameter Browse sends.
  set("mode", filters.listingType);
  set("condition", filters.condition);
  set("availability", filters.availability);
  set("sort", filters.sort);
  set("page", filters.page);
  set("pageSize", filters.pageSize);

  return params.toString();
}

/**
 * GET /api/favorites — the saved list, filtered, sorted and paginated
 * server-side. A large wishlist is never shipped whole just to be filtered in
 * the browser.
 */
export async function getFavorites(filters: FavoriteFilters): Promise<FavoriteListResponse> {
  const result = await api.get<FavoriteProduct[]>(`/favorites?${toQueryString(filters)}`);
  const pagination: Pagination = result.pagination ?? {
    page: filters.page,
    pageSize: filters.pageSize,
    total: result.data.length,
    totalPages: 1,
  };
  return { items: result.data, pagination };
}

/**
 * Status for one product.
 *
 * Deliberately *not* used by grids — calling it per card is exactly the N+1
 * pattern this feature avoids. Cards read the `isFavorited` flag the product
 * responses already carry, and single-product surfaces read the shared id list.
 */
export async function checkFavorite(productId: number): Promise<boolean> {
  const result = await api.get<{ productId: number; favorited: boolean }>(
    `/favorites/${productId}`,
  );
  return result.data.favorited;
}

/** Save a product. Idempotent: re-saving an already-saved product still succeeds. */
export async function addFavorite(productId: number): Promise<FavoriteMutationResult> {
  return (await api.post<FavoriteMutationResult>(`/favorites/${productId}`)).data;
}

/**
 * Remove the saved relationship. The product itself is untouched — it stays
 * listed in the marketplace.
 */
export async function removeFavorite(productId: number): Promise<FavoriteMutationResult> {
  return (await api.delete<FavoriteMutationResult>(`/favorites/${productId}`)).data;
}

/** Clear the signed-in user's whole wishlist. */
export async function clearFavorites(): Promise<number> {
  const result = await api.delete<{ cleared: number }>("/favorites");
  return result.data.cleared;
}

/** The ids the signed-in user has saved — the one small request behind every heart. */
export async function getFavoriteIds(): Promise<number[]> {
  return (await api.get<number[]>("/favorites/ids")).data;
}
