import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { patchOrderStatus, syncOrderItems, syncOrders, syncRentals } from "@/lib/tanstack-db";
import { cancelOrder, getOrderByRef, getOrders, orderAgain } from "./api";
import type { OrderDetailsResponse } from "./types";
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
  const query = useQuery(ordersListQueryOptions(search));

  // TanStack DB sync: whenever a list response lands, mirror the validated rows
  // into the reactive collection. Failure here must never break the page — the
  // collection is a derived store, not the source of truth.
  if (query.data) {
    try {
      syncOrders(
        query.data.orders.map((order) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          orderType: order.orderType,
          status: order.status,
          paymentStatus: order.paymentStatus,
          subtotal: order.subtotal,
          deliveryFee: order.deliveryFee,
          depositTotal: order.depositTotal,
          total: order.total,
          currency: order.currency,
          deliveryMethod: order.deliveryMethod,
          itemCount: order.itemCount,
          createdAt: order.createdAt,
        })),
      );
    } catch {
      // Collection stays stale; the query cache still holds the truth.
    }
  }

  return query;
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

/* -------------------------------- mutations -------------------------------- */

/**
 * Cancel the customer's own order.
 *
 * The optimistic part is deliberately tiny: the collection's status is patched
 * (so anything reactive shows `CANCELLED` immediately) and the detail cache is
 * written through. The list pages are *invalidated*, not guessed — pagination,
 * filters and sorting are server-computed and a client that tried to re-derive
 * them would invent a wrong page. No full reload ever happens.
 */
export function useCancelOrder(ref: string | number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: { reason?: string; reasonCode?: string }) => cancelOrder(ref, reason),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.order(ref) });
      const previous = queryClient.getQueryData<OrderDetailsResponse>(queryKeys.order(ref));
      if (previous) {
        queryClient.setQueryData<OrderDetailsResponse>(queryKeys.order(ref), {
          ...previous,
          order: { ...previous.order, status: "CANCELLED" },
        });
        if (previous.order.id !== undefined) patchOrderStatus(previous.order.id, "CANCELLED");
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.order(ref), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderAll });
    },
  });
}

/**
 * "Buy again" / "Rent again": asks the server to validate and add the line to
 * the shared cart. Only the cart cache is invalidated — the order data has not
 * changed, so order queries are left alone rather than refetched for nothing.
 */
export function useOrderAgain(ref: string | number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orderItemId?: number) => orderAgain(ref, orderItemId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
    },
  });
}

/**
 * Mirror a detail response into the TanStack DB collections. Called from the
 * detail page effect so the reactive store gains the order's lines and rentals
 * without any extra request.
 */
export function syncOrderDetailToCollections(data: OrderDetailsResponse): void {
  try {
    syncOrders([
      {
        id: data.order.id,
        orderNumber: data.order.orderNumber,
        orderType: data.order.orderType,
        status: data.order.status,
        paymentStatus: data.order.paymentStatus,
        subtotal: data.order.subtotal,
        deliveryFee: data.order.deliveryFee,
        depositTotal: data.order.depositTotal,
        total: data.order.total,
        currency: data.order.currency,
        deliveryMethod: data.order.deliveryMethod,
        itemCount: data.items.length,
        createdAt: data.order.createdAt,
      },
    ]);
    syncOrderItems(
      data.items.map((item) => ({
        id: item.id,
        orderId: data.order.id,
        productId: item.productId,
        sellerId: item.sellerId,
        mode: item.mode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        titleSnapshot: item.titleSnapshot,
        imageUrl: item.imageUrl,
        productSlug: item.productSlug,
      })),
    );
    syncRentals(
      data.rentals.map((rental) => ({
        id: rental.id,
        orderId: data.order.id,
        productId: rental.productId,
        startDate: rental.startDate,
        endDate: rental.endDate,
        status: rental.status,
        dailyRate: rental.dailyRate,
        rentalSubtotal: rental.rentalSubtotal,
        securityDeposit: rental.securityDeposit,
      })),
    );
  } catch {
    // Derived store only — never break the page for it.
  }
}
