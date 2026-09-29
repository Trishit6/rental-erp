import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { productDetailQueryOptions } from "@/lib/query/products";
import { getCategories, getProducts } from "./api";
import type { BrowseFilters, ProductListResponse } from "./types";

/* ---------------------------------- keys ------------------------------------ */

/**
 * Query-key factory. `products` embeds every server-relevant filter, so changing
 * any of them produces a distinct cache entry (and never serves stale results).
 */
export const browseKeys = {
  all: ["browse"] as const,
  products: (filters: BrowseFilters) => [...browseKeys.all, "products", filters] as const,
  /** Shared with the home feature — one cache entry for the category list. */
  categories: queryKeys.categories,
  product: (slug: string) => queryKeys.product(slug),
};

/**
 * Each page is cached under its own key, so the first visit fetches from the
 * database, paging fetches the new page, and returning to a page you already
 * viewed renders instantly from cache. 5 minutes fresh, 30 minutes retained.
 */
export const BROWSE_STALE_MS = 5 * 60_000;
export const BROWSE_GC_MS = 30 * 60_000;

/* --------------------------------- queries ---------------------------------- */

export function browseQueryOptions(filters: BrowseFilters) {
  return {
    queryKey: browseKeys.products(filters),
    queryFn: () => getProducts(filters),
    staleTime: BROWSE_STALE_MS,
    gcTime: BROWSE_GC_MS,
    // Hold the current results while the next set loads — no skeleton flash and
    // no layout jump. A cached page renders instantly instead.
    placeholderData: (previous: ProductListResponse | undefined) => previous,
  };
}

export function useBrowseProducts(filters: BrowseFilters) {
  return useQuery(browseQueryOptions(filters));
}

export function useBrowseCategories() {
  return useQuery({
    queryKey: browseKeys.categories,
    queryFn: getCategories,
    staleTime: 10 * 60_000,
  });
}

/** Warm a page in the background so paging feels instant. */
export function usePrefetchBrowsePage() {
  const queryClient = useQueryClient();

  return useCallback(
    (filters: BrowseFilters) => {
      void queryClient.prefetchQuery({
        queryKey: browseKeys.products(filters),
        queryFn: () => getProducts(filters),
        staleTime: BROWSE_STALE_MS,
        gcTime: BROWSE_GC_MS,
      });
    },
    [queryClient],
  );
}

/**
 * Prefetch a product's detail on hover/focus. Only ever called for the one card
 * under the pointer — never for the whole grid. Uses the shared product-detail
 * options, so what is warmed here is exactly what the product page reads.
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
