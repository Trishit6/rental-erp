import { HttpError } from "./api";

/**
 * Customer-side order cancellation.
 *
 * ## The state machine
 *
 * Cancellation is allowed only while the order is still in the seller's hands.
 * The ladder is shared with seller fulfillment (`order-fulfillment.ts`), so the
 * customer's view and the seller's view of "has this shipped yet?" can never
 * disagree: both read the same `ORDER_STATUSES` vocabulary and the same
 * `CANCELLABLE_FROM` set.
 *
 * Terminal states are terminal. A `COMPLETED` or `CANCELLED` order has no
 * outgoing edges, so a stale tab or a replayed request cannot rewrite history.
 *
 * A refused cancellation is a **409** — the request is well-formed, the *state*
 * forbids it — with a code the client can branch on and a message a person can
 * read.
 */

/** States from which the customer may cancel. Goods have not left yet. */
export const CUSTOMER_CANCELLABLE_FROM = new Set(["PENDING_PAYMENT", "CONFIRMED", "PROCESSING"]);

export type CancellationRefusal =
  "ALREADY_SHIPPED" | "ALREADY_CANCELLED" | "ALREADY_COMPLETED" | "PAYMENT_NOT_SETTLED";

export type CancellationCheck =
  | { allowed: true }
  | { allowed: false; refusal: CancellationRefusal; status: number; message: string };

/**
 * Decide, purely from state, whether a customer may cancel this order.
 *
 * Pure and exported for tests; the route layer turns the refusal into the
 * response. Rentals make cancellation coarser: the *seller* path could
 * theoretically cancel one line of a multi-seller order, but a customer
 * cancellation is whole-order, so any rental that has gone active (the item is
 * physically with someone) blocks it.
 */
export function checkCustomerCancellation(input: {
  status: string;
  paymentStatus: string;
  hasActiveRental: boolean;
}): CancellationCheck {
  const { status, paymentStatus, hasActiveRental } = input;

  if (status === "CANCELLED") {
    return {
      allowed: false,
      refusal: "ALREADY_CANCELLED",
      status: 409,
      message: "This order is already cancelled.",
    };
  }
  if (status === "COMPLETED") {
    return {
      allowed: false,
      refusal: "ALREADY_COMPLETED",
      status: 409,
      message: "This order is completed and can no longer be cancelled.",
    };
  }
  if (status === "SHIPPED" || status === "DELIVERED" || status === "READY_FOR_PICKUP") {
    return {
      allowed: false,
      refusal: "ALREADY_SHIPPED",
      status: 409,
      message:
        "This order has already been handed over for delivery, so it can no longer be cancelled.",
    };
  }
  if (hasActiveRental) {
    return {
      allowed: false,
      refusal: "ALREADY_SHIPPED",
      status: 409,
      message: "A rental on this order has already started, so it can no longer be cancelled.",
    };
  }
  // Unknown lifecycle values (a varchar, so a future feature can write one) are
  // treated as shipped: refusing wrongly is recoverable, cancelling an order
  // that was already out is not.
  const knownLadder = ["PENDING_PAYMENT", "CONFIRMED", "PROCESSING"];
  if (!knownLadder.includes(status)) {
    return {
      allowed: false,
      refusal: "ALREADY_SHIPPED",
      status: 409,
      message: "This order has progressed too far to be cancelled.",
    };
  }
  // An unpaid order can be "cancelled" but must never imply a refund happened.
  if (paymentStatus !== "PAID" && status !== "PENDING_PAYMENT") {
    return {
      allowed: false,
      refusal: "PAYMENT_NOT_SETTLED",
      status: 409,
      message: "The payment for this order is still being processed. Try again shortly.",
    };
  }

  return { allowed: true };
}

/** Customer-chosen reasons, as offered by the cancellation dialog. */
export const CANCELLATION_REASONS = [
  "CHANGED_MIND",
  "ORDERED_BY_MISTAKE",
  "FOUND_BETTER_OPTION",
  "DELIVERY_TOO_SLOW",
  "OTHER",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export function isCancellationReason(value: unknown): value is CancellationReason {
  return typeof value === "string" && (CANCELLATION_REASONS as readonly string[]).includes(value);
}

/** Refusal → the error the API contract carries. */
export function cancellationRefusalError(
  check: Extract<CancellationCheck, { allowed: false }>,
): HttpError {
  return new HttpError(check.status, check.refusal, check.message);
}
