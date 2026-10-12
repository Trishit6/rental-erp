import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { orders, paymentWebhookEvents, refunds, transactions, users } from "../schema";

/**
 * A single payment, and the evidence behind it (PROMPT 28).
 *
 * ## Why the webhook log lives on the transaction
 *
 * "The transaction says FAILED" is a conclusion; "the provider sent these three
 * events, and here is what each one said" is the evidence it was drawn from. Support
 * dealing with "my payment failed but money left my account" needs the second. The
 * events are archived by the webhook handler and read back here keyed on the
 * provider's payment id.
 *
 * ## Nothing sensitive is returned
 *
 * The columns are chosen explicitly, exactly as the list query does: no idempotency
 * keys, no provider secrets, and never a card number — the schema never stores one.
 */

/**
 * A one-line next step for a failed or stalled payment.
 *
 * Pure and exhaustive so the list and the detail render the same sentence for the
 * same row, and so a support agent is told what to try rather than just that
 * something failed.
 */
export function retryHint(status: string, failureReason: string | null): string | null {
  const reason = (failureReason ?? "").toLowerCase();
  switch (status) {
    case "FAILED":
      if (reason.includes("expired")) {
        return "The attempt expired. Start a new checkout to try again.";
      }
      if (reason.includes("not recognised")) {
        return "No provider record for this attempt — the customer likely closed the page before paying.";
      }
      if (reason.includes("verify")) {
        return "The proof did not check out. Retrying the same attempt is safe.";
      }
      return "The provider declined this payment. The customer can retry from checkout.";
    case "CANCELLED":
      return "The attempt was cancelled before it settled. No money moved.";
    case "PENDING":
      return "Still open — the customer can complete or cancel it.";
    case "PROCESSING":
      return "The provider is still settling this attempt.";
    default:
      return null;
  }
}

export type AdminTransactionDetail = {
  transaction: {
    id: number;
    type: string;
    amount: number;
    currency: string;
    status: string;
    provider: string;
    providerTransactionId: string | null;
    paymentMethod: string | null;
    failureReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    total: number;
    currency: string;
  } | null;
  customer: { id: number; name: string; email: string };
  /** Archived provider events for this payment, newest first. */
  webhookEvents: {
    id: number;
    provider: string;
    providerEventId: string;
    eventType: string;
    status: string;
    signatureVerified: boolean;
    errorMessage: string | null;
    payload: string;
    processedAt: string | null;
    createdAt: string;
  }[];
  /** Refunds raised against the same order. */
  refunds: {
    id: number;
    refundNumber: string;
    amount: number;
    status: string;
    providerReference: string | null;
    createdAt: string;
  }[];
  retryHint: string | null;
};

export async function getAdminTransactionDetail(
  id: number,
): Promise<AdminTransactionDetail | null> {
  const [row] = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      currency: transactions.currency,
      status: transactions.status,
      provider: transactions.provider,
      providerTransactionId: transactions.providerTransactionId,
      paymentMethod: transactions.paymentMethod,
      failureReason: transactions.failureReason,
      orderId: transactions.orderId,
      userId: transactions.userId,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
    })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (!row) return null;

  const [order] = row.orderId
    ? await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          total: orders.total,
          currency: orders.currency,
        })
        .from(orders)
        .where(eq(orders.id, row.orderId))
        .limit(1)
    : [];

  const [customer] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  const webhookEvents = row.providerTransactionId
    ? await db
        .select({
          id: paymentWebhookEvents.id,
          provider: paymentWebhookEvents.provider,
          providerEventId: paymentWebhookEvents.providerEventId,
          eventType: paymentWebhookEvents.eventType,
          status: paymentWebhookEvents.status,
          signatureVerified: paymentWebhookEvents.signatureVerified,
          errorMessage: paymentWebhookEvents.errorMessage,
          payload: paymentWebhookEvents.payload,
          processedAt: paymentWebhookEvents.processedAt,
          createdAt: paymentWebhookEvents.createdAt,
        })
        .from(paymentWebhookEvents)
        .where(eq(paymentWebhookEvents.providerPaymentId, row.providerTransactionId))
        .orderBy(desc(paymentWebhookEvents.createdAt))
        .limit(50)
    : [];

  const relatedRefunds = row.orderId
    ? await db
        .select({
          id: refunds.id,
          refundNumber: refunds.refundNumber,
          amount: refunds.amount,
          status: refunds.status,
          providerReference: refunds.providerReference,
          createdAt: refunds.createdAt,
        })
        .from(refunds)
        .where(eq(refunds.orderId, row.orderId))
        .orderBy(desc(refunds.createdAt))
        .limit(50)
    : [];

  return {
    transaction: {
      id: row.id,
      type: row.type,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      provider: row.provider,
      providerTransactionId: row.providerTransactionId,
      paymentMethod: row.paymentMethod,
      failureReason: row.failureReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    order: order
      ? {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: order.total,
          currency: order.currency,
        }
      : null,
    customer: customer ?? { id: row.userId, name: "Unknown", email: "" },
    webhookEvents: webhookEvents.map((event) => ({
      ...event,
      processedAt: event.processedAt ? event.processedAt.toISOString() : null,
      createdAt: event.createdAt.toISOString(),
    })),
    refunds: relatedRefunds.map((refund) => ({
      ...refund,
      createdAt: refund.createdAt.toISOString(),
    })),
    retryHint: retryHint(row.status, row.failureReason),
  };
}
