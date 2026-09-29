import { ApiError, api } from "../api/client";
import type { ProductDetail } from "../types";
import { queryKeys } from "./keys";

/**
 * The product-detail cache entry, shared by every consumer: the product page and
 * the browse/home grids that prefetch on hover. One fetch function, one key, one
 * staleness policy — so a hovered card and a visited page can never disagree.
 */

export const PRODUCT_DETAIL_STALE_MS = 5 * 60_000;
export const PRODUCT_DETAIL_GC_MS = 30 * 60_000;

/** 4xx is an answer, not a transient failure — don't burn retries on it. */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

/** Accepts either a slug or a numeric id; the backend resolves both. */
export async function fetchProductDetail(productIdOrSlug: string): Promise<ProductDetail> {
  const reference = encodeURIComponent(productIdOrSlug);
  return (await api.get<ProductDetail>(`/products/${reference}`)).data;
}

export function productDetailQueryOptions(productIdOrSlug: string) {
  return {
    queryKey: queryKeys.product(productIdOrSlug),
    queryFn: () => fetchProductDetail(productIdOrSlug),
    staleTime: PRODUCT_DETAIL_STALE_MS,
    gcTime: PRODUCT_DETAIL_GC_MS,
    retry: shouldRetryRequest,
  };
}
