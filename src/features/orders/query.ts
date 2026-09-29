import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { getOrderByRef, getOrders } from "./api";
import type { OrdersSearch } from "./components/schema";

/**
 * Orders queries.
 *
 * Caching choices, and why:
 *
 *  - The list is keyed by the *whole* filter object, so changing a filter is a
 *    different cache entry rather than a clobbered one. Going "back" to a
 *    previous filter combination is then instant instead of a refetch.
 *  - `placeholderData: keepPreviousData` keeps the current page on screen while
 *    the next one loads, so paging does not flash a skeleton over content the
 *    customer was reading.
 *  - Detail entries are keyed by the order's public number and are kept for the
 *    duration of the session, so opening an order, going back, and returning is
 *    a cache hit. Orders are historical: once fetched they barely change, and
 *    the mutations that do change them (cancelling a rental) already invalidate.
 *
 * Private data is protected by logout eviction in `lib/query/keys.ts`, not by
 * `staleTime` — see `privateQueryKeys`.
 */

const LIST_STALE_MS = 30_000;
const DETAIL_STALE_MS = 5 * 60_000;
const ORDER_GC_MS = 30 * 60_000;

export function ordersListQueryOptions(search: OrdersSearch) {
  return {
    queryKey: queryKeys.ordersList(search),
    queryFn: () => getOrders(search),
    staleTime: LIST_STALE_MS,
    gcTime: ORDER_GC_MS,
    placeholderData: keepPreviousData,
    // The global defaults already disable refetch-on-focus for this app; being
    // explicit here documents that a background order list should not shift
    // under the customer while they read it.
    refetchOnWindowFocus: false,
  };
}

export function useOrders(search: OrdersSearch) {
  return useQuery(ordersListQueryOptions(search));
}

export function orderDetailQueryOptions(ref: string | number) {
  return {
    queryKey: queryKeys.order(ref),
    queryFn: () => getOrderByRef(ref),
    staleTime: DETAIL_STALE_MS,
    gcTime: ORDER_GC_MS,
    // A missing or other-user's order is a definitive answer, not a transient
    // failure: retrying it just delays the "not found" screen by seconds.
    retry: (failureCount: number, error: unknown) => {
      const status = (error as { status?: number } | null)?.status;
      if (status === 404 || status === 403 || status === 401) return false;
      return failureCount < 2;
    },
    refetchOnWindowFocus: false,
  };
}

export function useOrder(ref: string | number | null) {
  return useQuery({
    ...orderDetailQueryOptions(ref ?? ""),
    enabled: ref !== null,
  });
}

/**
 * Warm one order's cache before navigating to it.
 *
 * Used when the customer opens an order from the list: the detail page then
 * renders from cache with no spinner. Cheap to call and a no-op if the entry is
 * already fresh.
 */
export function prefetchOrder(queryClient: QueryClient, ref: string | number) {
  return queryClient.prefetchQuery(orderDetailQueryOptions(ref));
}
