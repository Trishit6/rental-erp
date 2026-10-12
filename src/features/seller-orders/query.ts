import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/keys";
import {
  bulkFulfill,
  cancelSellerOrder,
  fetchSellerOrder,
  fetchSellerOrders,
  setSellerFulfillment,
} from "./api";
import { fulfillmentLabel, type BulkFulfillmentPayload, type SellerOrdersFilters } from "./types";

/**
 * Seller order-desk queries and mutations.
 *
 * ## What one write reconciles
 *
 * A fulfilment or cancellation changes more than the order it names: the
 * dashboard's "Orders to action" card counts the same lines, and a delivery can
 * move a wallet row. So every write invalidates the whole `sellerOrders` prefix
 * (list *and* detail, by prefix), the dashboard summary, and the alerts — one
 * blast radius for one action, rather than a chain of hand-picked keys that
 * eventually misses one.
 *
 * The customer's own view of the order is deliberately **not** touched here: it
 * belongs to another user's cache, which this client cannot reach. The server
 * writes them a notification instead (see `notifyOrderProgress`).
 */

/** Everything a seller write can make stale, in one place. */
function useInvalidateSellerOrders() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sellerOrders });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sellerSummary });
    void queryClient.invalidateQueries({ queryKey: queryKeys.sellerAlerts });
  };
}

export function useSellerOrders(filters: SellerOrdersFilters) {
  return useQuery({
    queryKey: queryKeys.sellerOrdersList(filters),
    queryFn: () => fetchSellerOrders(filters),
    // Hold the current page on screen while the next one loads, so paging and
    // filtering do not flash a skeleton over a list the seller is still reading.
    placeholderData: keepPreviousData,
  });
}

/**
 * One order's detail. Disabled until it is expanded, so the list costs one
 * request rather than one per row.
 */
export function useSellerOrder(reference: string | number | null) {
  return useQuery({
    queryKey: queryKeys.sellerOrder(reference ?? ""),
    queryFn: () => fetchSellerOrder(reference as string | number),
    enabled: reference !== null,
  });
}

export function useSetFulfillment() {
  const invalidate = useInvalidateSellerOrders();
  return useMutation({
    mutationFn: (input: { reference: string | number; status: string }) =>
      setSellerFulfillment(input.reference, input.status),
    onSuccess: (_detail, input) => {
      invalidate();
      toast.success(`Marked ${fulfillmentLabel(input.status).toLowerCase()}.`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not update this order.");
    },
  });
}

/**
 * The bulk write, called **after** the undo window elapses — nothing is sent
 * while the batch is still undoable. See `useUndoWindow`.
 */
export function useBulkFulfillment() {
  const invalidate = useInvalidateSellerOrders();
  return useMutation({
    mutationFn: (payload: BulkFulfillmentPayload) => bulkFulfill(payload),
    onSuccess: (result, payload) => {
      invalidate();
      const noun = result.updated === 1 ? "order" : "orders";
      toast.success(
        `${result.updated} ${noun} marked ${fulfillmentLabel(payload.status).toLowerCase()}.`,
      );
    },
    onError: (error) => {
      // Atomic server-side, so a refusal means nothing moved — the message names
      // the order that blocked the batch.
      toast.error(error instanceof Error ? error.message : "Could not update these orders.");
    },
  });
}

export function useCancelSellerOrder() {
  const invalidate = useInvalidateSellerOrders();
  return useMutation({
    mutationFn: (input: { reference: string | number; reason: string }) =>
      cancelSellerOrder(input.reference, input.reason),
    onSuccess: () => {
      invalidate();
      toast.success("Order cancelled.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not cancel this order.");
    },
  });
}
