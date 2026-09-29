import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { productDetailQueryOptions } from "@/lib/query/products";
import {
  getCategories,
  getCategoryBySlug,
  getCategoryProducts,
  getFeaturedCategories,
  getSubcategories,
} from "./api";
import type { CategoryFilters } from "./types";
import type { ProductListResponse } from "@/lib/product-search/types";

/* ---------------------------------- keys ------------------------------------ */

/**
 * Query-key factory.
 *
 * `list` is the same entry Home and Browse already cache (`queryKeys.categories`),
 * so walking Home → Categories → a category → back never refetches the category
 * list. `products` likewise reuses the shared product key namespace, because a
 * category page *is* a scoped product request — the category slug travels inside
 * the filter object, so every server-relevant filter (category, subcategory, sort,
 * price, page) is part of the key by construction.
 */
export const categoryKeys = {
  all: queryKeys.categories,
  list: queryKeys.categories,
  featured: ["categories", "featured"] as const,
  detail: (idOrSlug: string) => ["categories", "detail", idOrSlug] as const,
  subcategories: (idOrSlug: string) => ["categories", "subcategories", idOrSlug] as const,
  products: (filters: CategoryFilters) => queryKeys.products(filters),
};

/**
 * Categories change far less often than availability does, so they stay fresh for
 * ten minutes and are retained for an hour — long enough that navigating in and
 * out of the category pages never refetches them.
 */
export const CATEGORY_STALE_MS = 10 * 60_000;
export const CATEGORY_GC_MS = 60 * 60_000;
export const CATEGORY_PRODUCTS_STALE_MS = 5 * 60_000;
export const CATEGORY_PRODUCTS_GC_MS = 30 * 60_000;

/* --------------------------------- queries ---------------------------------- */

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.list,
    queryFn: getCategories,
    staleTime: CATEGORY_STALE_MS,
    gcTime: CATEGORY_GC_MS,
  });
}

export function useFeaturedCategories() {
  return useQuery({
    queryKey: categoryKeys.featured,
    queryFn: getFeaturedCategories,
    staleTime: CATEGORY_STALE_MS,
    gcTime: CATEGORY_GC_MS,
  });
}

export function useCategory(idOrSlug: string) {
  return useQuery({
    queryKey: categoryKeys.detail(idOrSlug),
    queryFn: () => getCategoryBySlug(idOrSlug),
    enabled: !!idOrSlug,
    staleTime: CATEGORY_STALE_MS,
    gcTime: CATEGORY_GC_MS,
    // A missing/inactive category is a permanent 404 — retrying it just delays the
    // not-found state.
    retry: (failureCount, error) => {
      const status = (error as { status?: number }).status;
      if (status === 404 || status === 400) return false;
      return failureCount < 1;
    },
  });
}

export function useSubcategories(idOrSlug: string, enabled = true) {
  return useQuery({
    queryKey: categoryKeys.subcategories(idOrSlug),
    queryFn: () => getSubcategories(idOrSlug),
    enabled: enabled && !!idOrSlug,
    staleTime: CATEGORY_STALE_MS,
    gcTime: CATEGORY_GC_MS,
  });
}

/**
 * Each filter combination gets its own cache entry, so paging back to a page you
 * already viewed renders instantly. `placeholderData` holds the previous results
 * while the next set loads — no skeleton flash and no layout jump.
 */
export function categoryProductsQueryOptions(filters: CategoryFilters) {
  return {
    queryKey: categoryKeys.products(filters),
    queryFn: () => getCategoryProducts(filters),
    staleTime: CATEGORY_PRODUCTS_STALE_MS,
    gcTime: CATEGORY_PRODUCTS_GC_MS,
    placeholderData: (previous: ProductListResponse | undefined) => previous,
  };
}

/**
 * `enabled` lets the page hold the request back until the category itself is known
 * to exist — an unknown or inactive slug must not fire a product query that can
 * only return nothing.
 */
export function useCategoryProducts(filters: CategoryFilters, enabled = true) {
  return useQuery({ ...categoryProductsQueryOptions(filters), enabled });
}

/* -------------------------------- prefetching -------------------------------- */

/**
 * Warm a category's detail (and, cheaply, its subcategories) when a card is hovered
 * or focused — the table has a handful of categories, so this stays a single small
 * request per card and never prefetches products.
 */
export function usePrefetchCategory() {
  const queryClient = useQueryClient();

  return useCallback(
    (idOrSlug: string) => {
      void queryClient.prefetchQuery({
        queryKey: categoryKeys.detail(idOrSlug),
        queryFn: () => getCategoryBySlug(idOrSlug),
        staleTime: CATEGORY_STALE_MS,
        gcTime: CATEGORY_GC_MS,
      });
      void queryClient.prefetchQuery({
        queryKey: categoryKeys.subcategories(idOrSlug),
        queryFn: () => getSubcategories(idOrSlug),
        staleTime: CATEGORY_STALE_MS,
        gcTime: CATEGORY_GC_MS,
      });
    },
    [queryClient],
  );
}

/** Warm the next page of results so pagination feels instant. */
export function usePrefetchCategoryProducts() {
  const queryClient = useQueryClient();

  return useCallback(
    (filters: CategoryFilters) => {
      void queryClient.prefetchQuery({
        queryKey: categoryKeys.products(filters),
        queryFn: () => getCategoryProducts(filters),
        staleTime: CATEGORY_PRODUCTS_STALE_MS,
        gcTime: CATEGORY_PRODUCTS_GC_MS,
      });
    },
    [queryClient],
  );
}

/**
 * Hovering a product card warms that product's detail in the shared product cache
 * — the same entry the product page reads.
 */
export function usePrefetchCategoryProduct() {
  const queryClient = useQueryClient();

  return useCallback(
    (slug: string) => {
      void queryClient.prefetchQuery(productDetailQueryOptions(slug));
    },
    [queryClient],
  );
}
