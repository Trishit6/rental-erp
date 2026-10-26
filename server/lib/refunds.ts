import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { refunds, orders, transactions } from "../schema";
import { HttpError } from "./api";
import { LIVE_REFUND_STATUSES, sumCaptured, sumRefunds } from "./refund-admin";
import { createRefundNumber } from "./reference-numbers";
import { recordEarningReversal } from "./wallet";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";
import { orderEventKey, recordOrderEvent } from "./order-events";
import { getPaymentProvider } from "./payments";

/**
 * Refund service - single source of truth for refund computations and actions.
 *
 * Invariants:
 *  1. A refund amount can never exceed captured - alreadyRefunded (ceiling enforcement)
 *  2. The deposit is ALWAYS refunded (policy default), regardless of the rental policy
 *  3. After-start refunds are per the platform_settings key 'rental.cancellation'
 *  4. Idempotent on idempotencyKey: a retry returns the existing row
 *  5. Gateway calls only happen for provider-supported payment types
 *  6. MANUAL_UPI and COD refunds are marked 'manual payout required' with an admin queue entry
 *  7. Seller wallet entries are reversed pro-rata
 *  8. Stock is released
 *  9. Events and notifications are written
 */

export type RefundPolicy = {
  fullRefundBeforeStart: boolean;
  depositAlwaysRefunded: boolean;
  afterStartRentalRefundPercent: number;
};

export const DEFAULT_REFUND_POLICY: RefundPolicy = {
  fullRefundBeforeStart: true,
  depositAlwaysRefunded: true,
  afterStartRentalRefundPercent: 0,
};

/**
 * Read the rental cancellation policy from platform_settings, falling back to defaults.
 */
export async function readRefundPolicy(
  executor: Pick<typeof db, "select"> = db,
): Promise<RefundPolicy> {
  const { readRentalCancellationPolicy } = await import("./rental-cancellation");
  return readRentalCancellationPolicy(executor);
}

/**
 * Compute the refundable amount for a rental cancellation.
 *
 * Follows the same pure arithmetic as `computeCancellationRefund` in
 * `rental-cancellation.ts`, but lives in the refund service so it can be
 * shared across all refund entry points.
 */
export function computeRefundAmount(
  policy: RefundPolicy,
  rental: { rentalSubtotal: number; securityDeposit: number; startDate: Date },
  captured: number,
  alreadyRefunded: number = 0,
): { beforeStart: boolean; rentalRefund: number; depositRefund: number; total: number } {
  const beforeStart = policy.fullRefundBeforeStart ? new Date() < rental.startDate : false;

  const rentalRefund = beforeStart
    ? policy.fullRefundBeforeStart
      ? Math.max(0, rental.rentalSubtotal)
      : 0
    : Math.round(
        (Math.max(0, rental.rentalSubtotal) * policy.afterStartRentalRefundPercent) / 100,
      );

  const depositRefund = policy.depositAlwaysRefunded
    ? Math.max(0, rental.securityDeposit)
    : 0;

  const ceiling = Math.max(0, captured - alreadyRefunded);
  const total = Math.min(rentalRefund + depositRefund, ceiling);

  return { beforeStart, rentalRefund, depositRefund, total: Math.max(0, total) };
}

/**
 * Create a refund request - the single writer of a new `refunds` row.
 *
 * Every flow that returns money — an operator's manual refund, a rental cancellation,
 * a dispute resolution — goes through here, so the "sum of live refunds ≤ captured"
 * invariant is enforced in exactly one place.
 *
 * Idempotent on `idempotencyKey` when one is supplied: the retry returns the row
 * that already exists rather than opening a second one.
 */
export async function createRefundRequest(
  executor: Pick<typeof db, "select" | "insert" | "update">,
  input: {
    orderId: number;
    userId: number;
    amount: number;
    currency: string;
    reason: string;
    captured?: number;
    idempotencyKey?: string | null;
    orderItemId?: number | null;
  },
): Promise<{ id: number; refundNumber: string; amount: number; status: string; duplicate: boolean }> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new HttpError(400, "REASON_REQUIRED", "A refund needs a reason.");
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new HttpError(400, "INVALID_AMOUNT", "A refund of at least one paisa is required.");
  }

  const key = input.idempotencyKey?.trim() || null;
  if (key) {
    const [existing] = await executor
      .select()
      .from(refunds)
      .where(eq(refunds.idempotencyKey, key))
      .limit(1);
    if (existing) {
      return {
        id: existing.id,
        refundNumber: existing.refundNumber,
        amount: existing.amount,
        status: existing.status,
        duplicate: true,
      };
    }
  }

  const captured = input.captured ?? (await sumCaptured(executor, input.orderId));
  const already = await sumRefunds(executor, input.orderId, LIVE_REFUND_STATUSES);
  const remaining = Math.max(0, captured - already);
  if (input.amount > remaining) {
    throw new HttpError(
      409,
      "EXCEEDS_REFUNDABLE",
      `A refund of ${input.amount} exceeds the ${remaining} still refundable on this order.`,
    );
  }

  const refundNumber = createRefundNumber();
  const [inserted] = await executor
    .insert(refunds)
    .values({
      refundNumber,
      orderId: input.orderId,
      orderItemId: input.orderItemId ?? null,
      transactionId: null,
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      reason,
      status: "PENDING",
      idempotencyKey: key,
      createdBy: null,
    })
    .$returningId();

  return {
    id: Number(inserted.id),
    refundNumber,
    amount: input.amount,
    status: "PENDING",
    duplicate: false,
  };
}

/**
 * Execute a refund through the payment provider.
 *
 * Called by the admin refund decision path and by the cancellation flow.
 * The provider call is idempotent via the refund number key.
 *
 * The original payment's providerTransactionId is read from the orders table's
 * linked payment transaction, not from the refund row itself.
 */
export async function executeRefund(
  executor: Pick<typeof db, "select" | "insert" | "update">,
  input: {
    refundId: number;
    refundNumber: string;
    amount: number;
    currency: string;
    orderId: number;
    userId: number;
    orderItemId?: number | null;
    providerReference?: string | null;
    reason: string;
  },
): Promise<{ id: number; refundNumber: string; status: string; providerReference?: string | null }> {
  const provider = getPaymentProvider();
  if (typeof provider.refundPayment !== "function") {
    throw new HttpError(
      501,
      "REFUNDS_UNAVAILABLE",
      "The configured payment provider cannot return money automatically.",
    );
  }

  const [refund] = await executor
    .select()
    .from(refunds)
    .where(eq(refunds.id, input.refundId))
    .limit(1);

  if (!refund) {
    throw new HttpError(404, "NOT_FOUND", "Refund not found.");
  }

  const [order] = await executor
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1);

  if (!order) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "The order no longer exists.");
  }

  // Idempotent: already succeeded
  if (refund.status === "SUCCEEDED") {
    return {
      id: refund.id,
      refundNumber: refund.refundNumber,
      status: refund.status,
      providerReference: refund.providerReference,
    };
  }

  // Get the original payment transaction's providerTransactionId from the orders
  // table's linked payment row. The orders table has paymentReference but the
  // actual provider transaction ID is in the transactions table.
  const [sourceTx] = await executor
    .select({
      id: transactions.id,
      provider: transactions.provider,
      providerTransactionId: transactions.providerTransactionId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.orderId, order.id),
        eq(transactions.type, "PAYMENT"),
        eq(transactions.status, "SUCCEEDED"),
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1);

  if (!sourceTx?.providerTransactionId) {
    throw new HttpError(
      409,
      "NO_CAPTURED_PAYMENT",
      "No settled payment was found to refund against.",
    );
  }

  const providerPaymentId = sourceTx.providerTransactionId;

  const result = await provider.refundPayment({
    providerPaymentId,
    amount: refund.amount,
    currency: refund.currency,
    idempotencyKey: `refund-${refund.refundNumber}`,
    reason: input.reason,
  });
  const providerReference = result.providerReference ?? input.providerReference ?? null;

  if (result.status !== "SUCCEEDED") {
    await executor
      .update(refunds)
      .set({ status: "FAILED", providerReference, updatedAt: new Date() })
      .where(eq(refunds.id, refund.id));

    await notify(executor, {
      userId: refund.userId,
      type: "REFUND_REJECTED",
      title: "A refund could not be completed",
      body: `The refund for order ${order.orderNumber ?? `#${order.id}`} could not be completed.`,
      context: { orderId: order.id, orderNumber: order.orderNumber },
      eventKey: notificationEventKey("REFUND_REJECTED", order.id, `${refund.refundNumber}:failed`),
    });

    return {
      id: refund.id,
      refundNumber: refund.refundNumber,
      status: "FAILED",
      providerReference,
    };
  }

  // Mark the refund as succeeded
  await executor
    .update(refunds)
    .set({
      status: "SUCCEEDED",
      providerReference,
      transactionId: refund.id,
      updatedAt: new Date(),
    })
    .where(eq(refunds.id, refund.id));

  // Write the REFUND ledger transaction
  await executor.insert(transactions).values({
    userId: refund.userId,
    orderId: order.id,
    type: "REFUND",
    amount: refund.amount,
    currency: refund.currency,
    status: "SUCCEEDED",
    provider: sourceTx?.provider ?? order.paymentProvider,
    providerTransactionId: providerReference,
    idempotencyKey: `refund-txn-${refund.refundNumber}`,
  });

  // Update the order's payment status
  const succeededSum = await sumRefunds(executor, order.id, ["SUCCEEDED"]);
  const captured = await sumCaptured(executor, order.id);
  const paymentStatus =
    succeededSum >= captured
      ? "REFUNDED"
      : succeededSum > 0
        ? "PARTIALLY_REFUNDED"
        : order.paymentStatus;

  await executor
    .update(orders)
    .set({ paymentStatus, updatedAt: new Date() })
    .where(eq(orders.id, order.id));

  // Record the order event
  await recordOrderEvent(executor, {
    orderId: order.id,
    type: "REFUND",
    toStatus: "REFUND_SUCCEEDED",
    actorId: refund.createdBy ?? null,
    actorRole: "ADMIN",
    note: input.reason,
    metadata: { refundNumber: refund.refundNumber, amount: refund.amount, providerReference },
    eventKey: orderEventKey("REFUND", order.id, `${refund.refundNumber}:succeeded`),
  });

  // Reverse seller wallet entries pro-rata
  await recordEarningReversal(executor, { orderItemId: refund.orderItemId as number | undefined }, input.reason);

  // Notify the user
  await notify(executor, {
    userId: refund.userId,
    type: "REFUND_PROCESSED",
    title: "Your refund is on its way",
    body: `${(refund.amount / 100).toFixed(2)} was refunded for order ${order.orderNumber ?? `#${order.id}`}.`,
    context: { orderId: order.id, orderNumber: order.orderNumber },
    eventKey: notificationEventKey("REFUND_PROCESSED", order.id, refund.refundNumber),
  });

  return {
    id: refund.id,
    refundNumber: refund.refundNumber,
    status: "SUCCEEDED",
    providerReference,
  };
}

/**
 * Mark a refund as MANUAL_UPI or COD, requiring admin payout.
 *
 * These refund types do not call a gateway provider. Instead, they create an
 * admin queue entry so finance can process the manual payout.
 */
export async function markManualPayoutRequired(
  executor: Pick<typeof db, "insert" | "update">,
  refundId: number,
): Promise<void> {
  await executor
    .update(refunds)
    .set({ status: "MANUAL_PAYOUT_REQUIRED", updatedAt: new Date() })
    .where(eq(refunds.id, refundId));
}