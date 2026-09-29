import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  createPaymentIntent,
  getPaymentProviderInfo,
  getPaymentStatus,
  getPaymentSummary,
  verifyPayment as verifyPaymentRequest,
  cancelPayment as cancelPaymentRequest,
} from "./api";
import {
  isTerminalPaymentStatus,
  type CreateIntentInput,
  type PaymentIntent,
  type PaymentStatusResponse,
  type PaymentSummary,
  type VerifyPaymentInput,
} from "./types";

/**
 * Payment queries and mutations.
 *
 * Caching rules, in order of importance:
 *
 *  - The summary is keyed by the checkout context (delivery method + address),
 *    because the same cart is legitimately worth different amounts. Two
 *    contexts must never share a cache entry.
 *  - Payment status is polled, but only while it is non-terminal, and the
 *    interval backs off. A settled payment never changes again, so an open tab
 *    must stop asking — an unbounded poll on a terminal status is a battery and
 *    a rate-limit problem for no benefit.
 *  - Order creation invalidates the cart, the order list and rentals from the
 *    mutation itself, not from the component. That way a success reached via a
 *    refresh or a webhook still leaves the cache coherent.
 */

const POLL_INTERVAL_MS = 3_000;
/** Above this, poll more slowly: a long-lived pending payment is not urgent. */
const SLOW_POLL_INTERVAL_MS = 10_000;
const SLOW_POLL_AFTER_MS = 60_000;

export function usePaymentProviderInfo() {
  return useQuery({
    queryKey: queryKeys.paymentMethods,
    queryFn: getPaymentProviderInfo,
    // Availability is a provider concern, not a user preference. It should not
    // be re-fetched on every navigation to the page.
    staleTime: 5 * 60 * 1000,
  });
}

export function usePaymentSummary(params: {
  deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryAddressId: number | null;
}) {
  const context = {
    deliveryMethod: params.deliveryMethod,
    deliveryAddressId: params.deliveryAddressId,
  };
  return useQuery({
    queryKey: queryKeys.paymentSummary(context),
    queryFn: () => getPaymentSummary(params),
    enabled: true,
    // Short: the whole point of re-fetching is to notice a price change the
    // customer has not agreed to yet.
    staleTime: 30 * 1000,
  });
}

/**
 * Poll one payment until it settles.
 *
 * `enabled` is false until there is a transaction to poll, and the refetch
 * predicate stops the whole thing the moment the status is terminal — so
 * SUCCEEDED, FAILED, CANCELLED and REFUNDED all end the loop.
 *
 * The back-off is measured from the query's own `dataUpdatedAt` rather than a
 * timestamp captured during render, which would be an impure call in the
 * render path and would restart on every re-render.
 */
export function usePaymentStatus(transactionId: number | null) {
  return useQuery({
    queryKey: queryKeys.paymentStatus(transactionId ?? "*"),
    queryFn: () => getPaymentStatus(transactionId as number),
    enabled: transactionId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && isTerminalPaymentStatus(status)) return false;
      const elapsed = Date.now() - query.state.dataUpdatedAt;
      return elapsed > SLOW_POLL_AFTER_MS ? SLOW_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
    },
    // A payment that settles between polls should be noticed at once, not up
    // to three seconds later.
    refetchOnWindowFocus: true,
  });
}

/**
 * A stable idempotency key for one checkout attempt.
 *
 * Held in a ref rather than state or storage: it must survive a re-render and a
 * retry, but it is meaningless once the page is closed, and it is not something
 * that belongs in localStorage. Reusing the key is what makes a double-clicked
 * Pay button return the first intent instead of opening a second.
 */
export function useIdempotencyKey(): () => string {
  const ref = useRef<string | null>(null);
  return useCallback(() => {
    ref.current ??= `revaro_${crypto.randomUUID()}`;
    return ref.current;
  }, []);
}

export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: (input: Omit<CreateIntentInput, "idempotencyKey"> & { idempotencyKey: string }) =>
      createPaymentIntent(input),
  });
}

export function useVerifyPayment(transactionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: VerifyPaymentInput) => verifyPaymentRequest(transactionId, input),
    onSuccess: () => {
      // The order now exists, so everything derived from "what the customer
      // owns" is stale. Invalidating here rather than in the component means a
      // success delivered by a refresh or a late webhook still lands correct.
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payment });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      // The whole `["order"]` prefix, not one id: the detail cache is keyed by
      // the order's *public* number, which this response may not match.
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rentals });
      void queryClient.invalidateQueries({ queryKey: queryKeys.transactions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    },
  });
}

export function useCancelPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: number) => cancelPaymentRequest(transactionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payment });
    },
  });
}

export type { PaymentIntent, PaymentStatusResponse, PaymentSummary };
