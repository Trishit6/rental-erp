import { HttpError } from "./api";
import { ORDER_STATUSES, type OrderStatus } from "./order-queries";

/**
 * Seller-side fulfillment.
 *
 * ## Why this is per line, not per order
 *
 * `orders.status` is one value for the whole order, and an order may contain
 * lines from several sellers. If Seller A's "Mark shipped" wrote
 * `orders.status`, then:
 *
 *  - Seller A would be making a statement about Seller B's goods;
 *  - the customer's order page would claim delivery for items nobody shipped;
 *  - and two sellers acting at once would overwrite each other.
 *
 * So fulfillment is recorded on `order_items.fulfillment_status` — on the line
 * whose seller is acting — and `orders.status` is left to the order's own
 * lifecycle. A seller never sees or writes another seller's lines.
 *
 * ## Why the vocabulary is the existing one
 *
 * The states are the fulfilment half of `ORDER_STATUSES`, not a second list of
 * near-synonyms. `READY_FOR_PICKUP` is this codebase's name for "ready", and
 * there is deliberately no `OUT_FOR_DELIVERY`: no code path could produce it, and
 * a state nothing can enter is a filter that can only ever return nothing.
 */

/** States a seller may move a line into, in forward order. */
export const SELLER_FULFILLMENT_STATES = [
  "PROCESSING",
  "READY_FOR_PICKUP",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
] as const;

export type SellerFulfillmentState = (typeof SELLER_FULFILLMENT_STATES)[number];

/**
 * The transition table.
 *
 * Terminal states are terminal: `CANCELLED` and `COMPLETED` have no outgoing
 * edges, so a completed order cannot be dragged back to `PROCESSING` by a
 * stale tab or a replayed request. `null` is the "untouched line" key and stands
 * for wherever the order itself currently is.
 */
const TRANSITIONS: Record<string, readonly SellerFulfillmentState[]> = {
  // A line whose order is not yet confirmed cannot be worked: nothing has been
  // paid, so there is nothing to fulfil.
  PENDING_PAYMENT: [],
  CONFIRMED: ["PROCESSING"],
  PROCESSING: ["READY_FOR_PICKUP", "SHIPPED"],
  READY_FOR_PICKUP: ["SHIPPED", "DELIVERED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Cancellation is allowed only before the goods have left. */
const CANCELLABLE_FROM = new Set(["CONFIRMED", "PROCESSING", "READY_FOR_PICKUP"]);

export function isSellerFulfillmentState(value: unknown): value is SellerFulfillmentState {
  return (
    typeof value === "string" && (SELLER_FULFILLMENT_STATES as readonly string[]).includes(value)
  );
}

/**
 * The state a line is *effectively* in.
 *
 * A line the seller has not touched inherits the order's status, so the seller
 * view shows the truth from the first moment without a backfill migration and
 * without inventing a value the database never held.
 */
export function effectiveFulfillment(
  lineStatus: string | null | undefined,
  orderStatus: string,
): string {
  if (lineStatus) return lineStatus;
  return (ORDER_STATUSES as readonly string[]).includes(orderStatus) ? orderStatus : "CONFIRMED";
}

/** What this line can move to next, given where it is. */
export function allowedTransitions(
  orderStatus: string,
  lineStatus: string | null,
): {
  next: SellerFulfillmentState[];
  canCancel: boolean;
} {
  const current = effectiveFulfillment(lineStatus, orderStatus);
  return {
    next: [...(TRANSITIONS[current] ?? [])],
    canCancel: CANCELLABLE_FROM.has(current),
  };
}

/**
 * Assert a transition, or refuse it with a reason a person can read.
 *
 * A `409` rather than a `400`: the request is well-formed, the *state* forbids
 * it, and a retry after a refresh may well succeed. It also tells the client the
 * difference between "you sent nonsense" and "not from here".
 */
export function assertFulfillmentTransition(
  orderStatus: string,
  lineStatus: string | null,
  target: SellerFulfillmentState,
): void {
  const current = effectiveFulfillment(lineStatus, orderStatus);
  const allowed = TRANSITIONS[current] ?? [];

  if (allowed.includes(target)) return;

  if (current === "CANCELLED" || current === "COMPLETED") {
    throw new HttpError(
      409,
      "INVALID_TRANSITION",
      `This order is ${current === "CANCELLED" ? "cancelled" : "completed"} and can no longer be changed.`,
    );
  }
  if (allowed.length === 0) {
    throw new HttpError(409, "INVALID_TRANSITION", "This order is not ready to be processed yet.");
  }

  throw new HttpError(
    409,
    "INVALID_TRANSITION",
    `An order that is ${describeStatus(current)} cannot be moved to ${describeStatus(target)}.`,
  );
}

/** Cancellation has its own rule because it is reachable from several states. */
export function assertCancellable(orderStatus: string, lineStatus: string | null): void {
  const current = effectiveFulfillment(lineStatus, orderStatus);
  if (CANCELLABLE_FROM.has(current)) return;

  if (current === "CANCELLED") {
    throw new HttpError(409, "INVALID_TRANSITION", "This order is already cancelled.");
  }
  throw new HttpError(
    409,
    "CANCELLATION_UNAVAILABLE",
    "This order has already been shipped, so it can no longer be cancelled here.",
  );
}

/**
 * `READY_FOR_PICKUP` → `ready for pickup`, for use inside a sentence.
 *
 * Deliberately lowercase and **not exported as a label helper**: display labels
 * already live in one place on the client (`statusLabel`), and a second
 * implementation here would eventually disagree with it. This exists only so the
 * refusal below reads as a sentence a person said rather than an enum shouted
 * back at them.
 */
function describeStatus(value: string): string {
  return value.toLowerCase().split("_").join(" ");
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}
