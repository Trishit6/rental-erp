import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { productDetailQueryOptions } from "@/lib/query/products";
import { getFavorites } from "./api";
import type { FavoriteFilters, FavoriteListResponse } from "./types";

/**
 * Wishlist page queries.
 *
 * The list hangs off the shared `["favorites"]` key prefix, so the whole
 * wishlist is evicted on logout with every other private entry, and a mutation
 * anywhere in the app can reconcile it by invalidating `["favorites", "list"]`.
 *
 * Each filter/sort/page combination is its own cache entry, so a page the user
 * already visited renders instantly on the way back.
 */

export const FAVORITES_STALE_MS = 5 * 60_000;
export const FAVORITES_GC_MS = 30 * 60_000;

export const favoritesKeys = {
  all: queryKeys.favorites,
  /** User, filters, sort and page are all inside the key. */
  list: (filters: FavoriteFilters) => queryKeys.favoritesList(filters),
  ids: queryKeys.favoriteIds,
};

export function favoritesQueryOptions(filters: FavoriteFilters) {
  return {
    queryKey: favoritesKeys.list(filters),
    queryFn: () => getFavorites(filters),
    staleTime: FAVORITES_STALE_MS,
    gcTime: FAVORITES_GC_MS,
    // Hold the current page while the next one loads: no skeleton flash and no
    // layout jump, and a cached page renders immediately.
    placeholderData: (previous: FavoriteListResponse | undefined) => previous,
  };
}

export function useFavorites(filters: FavoriteFilters) {
  return useQuery(favoritesQueryOptions(filters));
}

/** Warm a page on hover/focus so paging feels instant. */
export function usePrefetchFavoritesPage() {
  const queryClient = useQueryClient();

  return useCallback(
    (filters: FavoriteFilters) => {
      void queryClient.prefetchQuery(favoritesQueryOptions(filters));
    },
    [queryClient],
  );
}

/**
 * Warm a saved product's detail page on hover/focus — only ever the one card
 * under the pointer. Uses the shared product-detail options, so what is warmed
 * here is exactly what the product page reads.
 */
export function usePrefetchProduct() {
  const queryClient = useQueryClient();

  return useCallback(
    (slug: string) => {
      void queryClient.prefetchQuery(productDetailQueryOptions(slug));
    },
    [queryClient],
  );
}
