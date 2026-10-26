import { ORDER_STATUSES, type OrderStatus } from "./order-queries";

/**
 * Mapping the legacy `PAID` order status onto the current lifecycle.
 *
 * ## Why this is a planner, not a script body
 *
 * `PAID` predates the split between an order's *fulfillment* state and its
 * *payment* state. Orders written before that split sit at `status = 'PAID'`,
 * which is not a member of `ORDER_STATUSES` — so they render with no badge, they
 * match no filter, and the admin order desk cannot move them. The migration has
 * to rewrite them, and a rewrite of live money rows must be inspectable
 * *before* it runs and repeatable if it is interrupted.
 *
 * So the decision — "what should this row become?" — is a pure function here,
 * tested against fixtures, and the script in `server/db-migrate-legacy-paid.ts`
 * is only I/O around it. Nothing is deleted: a `PAID` order moves to `CONFIRMED`
 * (or `COMPLETED` once its rentals are all closed), its `payment_status` becomes
 * `PAID`, and a matching `PAYMENT` transaction that never reached `SUCCEEDED` is
 * marked so. Rows are rewritten in place, never dropped.
 */

/** The one legacy fulfillment status this migration knows how to place. */
export const LEGACY_PAID_STATUS = "PAID";

export type LegacyPaidOrder = {
  id: number;
  orderNumber: string | null;
  status: string;
  paymentStatus: string;
  /** True when at least one SUCCEEDED `PAYMENT` transaction references the order. */
  hasSucceededPayment: boolean;
  /**
   * True when the order has rentals and every one of them is `RETURNED`,
   * `COMPLETED` or `CANCELLED`. An order with no rentals is *not* complete —
   * it is a purchase that was simply paid.
   */
  allRentalsClosed: boolean;
  /** The most recent `PAYMENT` transaction for the order that is not yet SUCCEEDED. */
  pendingPaymentTransactionId: number | null;
  /** Whether the order contains any rental at all. */
  hasRentals: boolean;
};

export type LegacyStatusPlan = {
  orderId: number;
  orderNumber: string | null;
  from: string;
  /** The fulfillment status the row should hold after the migration. */
  to: OrderStatus;
  /** The payment status the row should hold after the migration. */
  paymentStatus: "PAID";
  /** A `PAYMENT` transaction to promote to `SUCCEEDED`, when one is stranded. */
  promoteTransactionId: number | null;
};

/**
 * The target fulfillment status for a legacy paid order.
 *
 * `COMPLETED` only when the order actually contained rentals and every one is
 * closed — a purchase is `CONFIRMED` when paid, and calling it `COMPLETED` would
 * assert fulfillment that never happened.
 */
export function legacyPaidTargetStatus(
  order: Pick<LegacyPaidOrder, "hasRentals" | "allRentalsClosed">,
): OrderStatus {
  return order.hasRentals && order.allRentalsClosed ? "COMPLETED" : "CONFIRMED";
}

/**
 * Plan the rewrite of one order. Returns `null` for anything that is not a
 * legacy `PAID` row, so the caller can filter a whole table without branching.
 */
export function planLegacyPaidOrder(order: LegacyPaidOrder): LegacyStatusPlan | null {
  if (order.status !== LEGACY_PAID_STATUS) return null;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    from: order.status,
    to: legacyPaidTargetStatus(order),
    paymentStatus: "PAID",
    promoteTransactionId: order.hasSucceededPayment ? null : order.pendingPaymentTransactionId,
  };
}

/** Plan every legacy row in a batch, dropping the ones already current. */
export function planLegacyPaidMigration(orders: readonly LegacyPaidOrder[]): LegacyStatusPlan[] {
  return orders
    .map(planLegacyPaidOrder)
    .filter((plan): plan is LegacyStatusPlan => plan !== null);
}

/** Guard used by the script and the migration test. */
export function isKnownOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}
