import { api } from "@/lib/api/client";
import type {
  CreateIntentInput,
  OrderConfirmation,
  PaymentIntent,
  PaymentProviderInfo,
  PaymentStatus,
  PaymentStatusResponse,
  PaymentSummary,
  VerifyPaymentInput,
} from "./types";

/**
 * Every network call the payment feature makes. Components never import this
 * file directly — they use the hooks in `query.ts`, which keep the cache keyed
 * consistently for the page, the polling loop and the post-order invalidation.
 *
 * Nothing sent from here carries an amount. The server recomputes the total
 * from the cart on every call, so a tampered request body cannot change what is
 * charged — it can only fail validation.
 */

export async function getPaymentProviderInfo(): Promise<PaymentProviderInfo> {
  return (await api.get<PaymentProviderInfo>("/payments/methods")).data;
}

/**
 * The amount, as the server computes it from the cart right now.
 *
 * `GET` rather than `POST`: this is a read. It reserves nothing and commits
 * nothing, which is why it is safe to call on every render of a stale page.
 */
export async function getPaymentSummary(params: {
  deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryAddressId?: number | null;
}): Promise<PaymentSummary> {
  const query = new URLSearchParams({ deliveryMethod: params.deliveryMethod });
  if (params.deliveryAddressId) {
    query.set("deliveryAddressId", String(params.deliveryAddressId));
  }
  return (await api.get<PaymentSummary>(`/payments/summary?${query.toString()}`)).data;
}

export async function createPaymentIntent(input: CreateIntentInput): Promise<PaymentIntent> {
  return (await api.post<PaymentIntent>("/payments/intents", input)).data;
}

export async function getPaymentStatus(transactionId: number): Promise<PaymentStatusResponse> {
  return (await api.get<PaymentStatusResponse>(`/payments/${transactionId}`)).data;
}

/**
 * Ask the server to confirm the payment and, only if it really is confirmed,
 * create the order.
 *
 * The request carries no amount and no success flag: the server asks the
 * provider what actually happened and acts only on that answer. Returns the
 * order confirmation either way — a settled payment that already has an order
 * returns that order rather than making a second one, so a double-submitted
 * form is harmless.
 */
export async function verifyPayment(
  transactionId: number,
  input: VerifyPaymentInput,
): Promise<OrderConfirmation> {
  return (await api.post<OrderConfirmation>(`/payments/${transactionId}/verify`, input)).data;
}

/** Cancel an attempt. The cart is deliberately left intact. */
export async function cancelPayment(
  transactionId: number,
): Promise<{ transactionId: number; status: PaymentStatus }> {
  return (
    await api.post<{ transactionId: number; status: PaymentStatus }>(
      `/payments/${transactionId}/cancel`,
    )
  ).data;
}
