import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  disputes,
  orderItems,
  orders,
  refunds,
  rentals,
  transactions,
  users,
} from "../schema";
import { HttpError } from "./api";
import type { ActorRole } from "./enums";
import { CUSTOMER_CANCELLABLE_FROM } from "./order-cancellation";
import { listOrderTimeline, orderEventKey, recordOrderEvent } from "./order-events";
import { notifyOrderProgress } from "./order-notifications";
import { ORDER_STATUSES, type OrderStatus } from "./order-queries";
import { createRefundNumber } from "./reference-numbers";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";

/**
 * The admin order desk (PROMPT 27).
 *
 * ## Shared state machine, admin-only edges
 *
 * A status change made here must mean the same thing the customer and the seller
 * mean by it, so the vocabulary is the existing `ORDER_STATUSES` and the ordinary
 * move is validated against `ADMIN_ORDER_TRANSITIONS` — a superset of the customer
 * ladder that adds the forward moves an operator makes on someone's behalf. The
 * genuine escape hatch is `overrideAdminOrderStatus`, which allows *any* target but
 * demands a written reason and audits it. Keeping the two apart is what makes
 * "every override audited" a property rather than a hope: a normal move cannot
 * silently jump the ladder, and a jump cannot happen without a reason on the record.
 *
 * ## Money is not moved here
 *
 * `requestOrderRefund` creates a `PENDING` refund — a *request*, matching the
 * refund architecture (PROMPT 28 owns approval and execution). The one invariant
 * it enforces is the one that must never be violated at the point of request:
 * the sum of live refunds can never exceed what was captured.
 */

/* --------------------------------- machine ---------------------------------- */

/**
 * The transitions an administrator may make through the ordinary action.
 *
 * Terminal states have no outgoing edge. `READY_FOR_PICKUP` may go straight to
 * `DELIVERED` because a customer collecting in person skips "shipped"; a
 * cancellation is offered from the states where goods have not left.
 */
export const ADMIN_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "READY_FOR_PICKUP", "CANCELLED"],
  PROCESSING: ["READY_FOR_PICKUP", "SHIPPED", "CANCELLED"],
  READY_FOR_PICKUP: ["SHIPPED", "DELIVERED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** The statuses an order in `status` may legally move to. Empty for terminal states. */
export function adminOrderNextStatuses(status: string): OrderStatus[] {
  return ADMIN_ORDER_TRANSITIONS[status as OrderStatus] ?? [];
}

export function isAdminOrderTransition(from: string, to: string): boolean {
  if (from === to) return false;
  return adminOrderNextStatuses(from).includes(to as OrderStatus);
}

/** Every status an override may target — anything the column may hold. */
export function isOverridableOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/* ---------------------------------- detail ---------------------------------- */

export type AdminOrderItem = {
  id: number;
  productId: number;
  sellerId: number;
  sellerName: string;
  mode: string;
  quantity: number;
  unitPrice: number;
  rentalCharge: number;
  securityDeposit: number;
  lineTotal: number;
  titleSnapshot: string;
  slugSnapshot: string | null;
  fulfillmentStatus: string | null;
  cancellationReason: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

export type AdminOrderSellerSplit = {
  sellerId: number;
  sellerName: string;
  lines: number;
  /** Non-deposit money on this seller's lines (`lineTotal - securityDeposit`). */
  goods: number;
  deposit: number;
  total: number;
};

export type AdminOrderTransaction = {
  id: number;
  type: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerTransactionId: string | null;
  createdAt: Date;
};

export type AdminOrderRental = {
  id: number;
  status: string;
  startDate: Date;
  endDate: Date;
  actualReturnDate: Date | null;
  securityDeposit: number;
  total: number;
  itemTitle: string;
};

export type AdminOrderRefund = {
  id: number;
  refundNumber: string;
  amount: number;
  status: string;
  reason: string | null;
  createdAt: Date;
};

export type AdminOrderDispute = {
  id: number;
  disputeNumber: string;
  status: string;
  reason: string;
  createdAt: Date;
};

export type AdminOrderDetail = {
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    orderType: string;
    subtotal: number;
    deliveryFee: number;
    depositTotal: number;
    discount: number;
    tax: number;
    total: number;
    currency: string;
    deliveryMethod: string;
    deliveryAddress: string | null;
    trackingNumber: string | null;
    paymentProvider: string;
    paymentReference: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  customer: { id: number; name: string; email: string; phone: string | null };
  items: AdminOrderItem[];
  sellerSplit: AdminOrderSellerSplit[];
  transactions: AdminOrderTransaction[];
  rentals: AdminOrderRental[];
  refunds: AdminOrderRefund[];
  disputes: AdminOrderDispute[];
  timeline: Awaited<ReturnType<typeof listOrderTimeline>>;
};

const liveRefundStatuses = ["PENDING", "PROCESSING", "SUCCEEDED"] as const;

export async function getAdminOrderDetail(id: number): Promise<AdminOrderDetail | null> {
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      orderType: orders.orderType,
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      depositTotal: orders.depositTotal,
      discount: orders.discount,
      tax: orders.tax,
      total: orders.total,
      currency: orders.currency,
      deliveryMethod: orders.deliveryMethod,
      deliveryAddress: orders.deliveryAddressSnapshot,
      trackingNumber: orders.trackingNumber,
      paymentProvider: orders.paymentProvider,
      paymentReference: orders.paymentReference,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      userId: orders.userId,
      customerName: users.name,
      customerEmail: users.email,
      customerPhone: users.phone,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, id))
    .limit(1);
  if (!order) return null;

  const [itemRows, transactionRows, rentalRows, refundRows, disputeRows, timeline] =
    await Promise.all([
      db
        .select({
          id: orderItems.id,
          productId: orderItems.productId,
          sellerId: orderItems.sellerId,
          sellerName: users.name,
          mode: orderItems.mode,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          rentalCharge: orderItems.rentalCharge,
          securityDeposit: orderItems.securityDeposit,
          lineTotal: orderItems.lineTotal,
          titleSnapshot: orderItems.titleSnapshot,
          slugSnapshot: orderItems.slugSnapshot,
          fulfillmentStatus: orderItems.fulfillmentStatus,
          cancellationReason: orderItems.cancellationReason,
          startDate: orderItems.startDate,
          endDate: orderItems.endDate,
        })
        .from(orderItems)
        .innerJoin(users, eq(orderItems.sellerId, users.id))
        .where(eq(orderItems.orderId, id))
        .orderBy(orderItems.id),
      db
        .select({
          id: transactions.id,
          type: transactions.type,
          amount: transactions.amount,
          currency: transactions.currency,
          status: transactions.status,
          provider: transactions.provider,
          providerTransactionId: transactions.providerTransactionId,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(eq(transactions.orderId, id))
        .orderBy(desc(transactions.createdAt)),
      db
        .select({
          id: rentals.id,
          status: rentals.status,
          startDate: rentals.startDate,
          endDate: rentals.endDate,
          actualReturnDate: rentals.actualReturnDate,
          securityDeposit: rentals.securityDeposit,
          total: rentals.total,
          itemTitle: orderItems.titleSnapshot,
        })
        .from(rentals)
        .innerJoin(orderItems, eq(rentals.orderItemId, orderItems.id))
        .where(eq(rentals.orderId, id))
        .orderBy(rentals.id),
      db
        .select({
          id: refunds.id,
          refundNumber: refunds.refundNumber,
          amount: refunds.amount,
          status: refunds.status,
          reason: refunds.reason,
          createdAt: refunds.createdAt,
        })
        .from(refunds)
        .where(eq(refunds.orderId, id))
        .orderBy(desc(refunds.createdAt)),
      db
        .select({
          id: disputes.id,
          disputeNumber: disputes.disputeNumber,
          status: disputes.status,
          reason: disputes.reason,
          createdAt: disputes.createdAt,
        })
        .from(disputes)
        .where(eq(disputes.orderId, id))
        .orderBy(desc(disputes.createdAt)),
      listOrderTimeline(id),
    ]);

  return {
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      orderType: order.orderType,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      depositTotal: order.depositTotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      currency: order.currency,
      deliveryMethod: order.deliveryMethod,
      deliveryAddress: order.deliveryAddress,
      trackingNumber: order.trackingNumber,
      paymentProvider: order.paymentProvider,
      paymentReference: order.paymentReference,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    },
    customer: {
      id: order.userId,
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
    },
    items: itemRows,
    sellerSplit: splitBySeller(itemRows),
    transactions: transactionRows,
    rentals: rentalRows,
    refunds: refundRows,
    disputes: disputeRows,
    timeline,
  };
}

/** Group lines by seller, summing goods and deposit separately. */
export function splitBySeller(items: AdminOrderItem[]): AdminOrderSellerSplit[] {
  const map = new Map<number, AdminOrderSellerSplit>();
  for (const item of items) {
    const current = map.get(item.sellerId) ?? {
      sellerId: item.sellerId,
      sellerName: item.sellerName,
      lines: 0,
      goods: 0,
      deposit: 0,
      total: 0,
    };
    current.lines += 1;
    current.goods += item.lineTotal - item.securityDeposit;
    current.deposit += item.securityDeposit;
    current.total += item.lineTotal;
    map.set(item.sellerId, current);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/* --------------------------------- actions ---------------------------------- */

type Actor = { id: number; role: ActorRole };

/** The amount of this order that could still be refunded, in paise. Never negative. */
export async function refundableAmount(orderId: number, total: number): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`COALESCE(SUM(${refunds.amount}), 0)` })
    .from(refunds)
    .where(and(eq(refunds.orderId, orderId), inArray(refunds.status, [...liveRefundStatuses])));
  return Math.max(0, total - Number(row?.value ?? 0));
}

/** A refund is only offered against money that actually settled. */
function assertRefundable(paymentStatus: string): void {
  if (paymentStatus !== "PAID" && paymentStatus !== "PARTIALLY_REFUNDED") {
    throw new HttpError(409, "PAYMENT_NOT_SETTLED", "This order has no settled payment to refund.");
  }
}

/**
 * Move an order along the ladder. Refuses a transition the machine forbids.
 *
 * One transaction: the status update, its timeline entry and the customer notice
 * succeed or fail together. The notice is best-effort by construction (`notify`
 * swallows), but the timeline entry and the status move are one unit so the trail
 * can never describe a move that did not happen.
 */
export async function setAdminOrderStatus(
  actor: Actor,
  order: { id: number; orderNumber: string | null; userId: number; status: string },
  target: OrderStatus,
): Promise<void> {
  if (!isAdminOrderTransition(order.status, target)) {
    throw new HttpError(
      409,
      "TRANSITION_NOT_ALLOWED",
      `An order cannot move from ${order.status} to ${target}. Use an override with a reason instead.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: target, updatedAt: new Date() })
      .where(and(eq(orders.id, order.id), eq(orders.status, order.status)));

    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "STATUS_CHANGED",
      fromStatus: order.status,
      toStatus: target,
      actorId: actor.id,
      actorRole: actor.role,
      eventKey: orderEventKey("STATUS_CHANGED", order.id, `${order.status}:${target}`),
    });

    await notifyOrderProgress(tx, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: target,
      discriminator: actor.id,
    });
  });
}

/**
 * Force any status, with a reason that is mandatory and audited.
 *
 * Every other action in this module is a state machine; this one is the deliberate
 * exception, so it records the *reason* on the timeline (`OVERRIDE`) and the route
 * writes the audit-log entry. A blank reason is refused here rather than trimmed to
 * one by the caller, so no path can produce an unexplained override.
 */
export async function overrideAdminOrderStatus(
  actor: Actor,
  order: { id: number; orderNumber: string | null; userId: number; status: string },
  target: OrderStatus,
  reason: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new HttpError(400, "REASON_REQUIRED", "An override needs a reason of at least 3 characters.");
  }
  if (target === order.status) {
    throw new HttpError(409, "NO_CHANGE", "The order is already in that status.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: target, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "OVERRIDE",
      fromStatus: order.status,
      toStatus: target,
      actorId: actor.id,
      actorRole: actor.role,
      note: trimmed,
      metadata: { reason: trimmed },
      eventKey: orderEventKey("OVERRIDE", order.id, `${Date.now()}:${target}`),
    });

    await notifyOrderProgress(tx, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: target,
      discriminator: `${actor.id}:${Date.now()}`,
    });
  });
}

/** An internal note. Never reaches the customer; only the timeline. */
export async function addAdminOrderNote(
  actor: Actor,
  order: { id: number; status: string },
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    throw new HttpError(400, "NOTE_REQUIRED", "Write something before saving a note.");
  }
  await recordOrderEvent(db, {
    orderId: order.id,
    type: "NOTE_ADDED",
    toStatus: order.status,
    actorId: actor.id,
    actorRole: actor.role,
    note: trimmed,
  });
}

/**
 * Cancel an order on the customer's behalf.
 *
 * Reuses the customer cancellation guard so admin and customer can never disagree
 * about whether an order is still cancellable, but does not require the customer's
 * permission; the guard is about *state*, not ownership. Sets `paymentStatus` to
 * `REFUNDED` only when the refund request created below actually covers the total.
 */
export async function cancelAdminOrder(
  actor: Actor,
  order: { id: number; orderNumber: string | null; userId: number; status: string; paymentStatus: string },
  hasActiveRental: boolean,
  reason: string,
): Promise<void> {
  if (!CUSTOMER_CANCELLABLE_FROM.has(order.status)) {
    throw new HttpError(409, "NOT_CANCELLABLE", `An order in ${order.status} cannot be cancelled.`);
  }
  if (hasActiveRental) {
    throw new HttpError(409, "RENTAL_ACTIVE", "A rental on this order has already started.");
  }
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new HttpError(400, "REASON_REQUIRED", "A cancellation needs a reason.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "CANCELLED",
      fromStatus: order.status,
      toStatus: "CANCELLED",
      actorId: actor.id,
      actorRole: actor.role,
      note: trimmed,
      metadata: { reason: trimmed },
      eventKey: orderEventKey("CANCELLED", order.id),
    });

    await notify(tx, {
      userId: order.userId,
      type: "ORDER_CANCELLED",
      title: "Your order was cancelled",
      body: `Order ${order.orderNumber ?? `#${order.id}`} was cancelled by our team. ${trimmed}`,
      context: { orderId: order.id, orderNumber: order.orderNumber },
      eventKey: notificationEventKey("ORDER_CANCELLED", order.id, actor.id),
    });
  });
}

export type RequestRefundInput = {
  amount: number;
  orderItemId?: number | null;
  reason: string;
  idempotencyKey?: string | null;
};

/**
 * Open a refund request. Idempotent on `idempotencyKey`.
 *
 * The amount is validated against `refundableAmount`, which reads the live refunds
 * in the same transaction — so two concurrent requests cannot jointly exceed the
 * captured total. The request is `PENDING`: approval and execution live in the
 * refund architecture, and creating one here records the *intent*, not the money.
 */
export async function requestOrderRefund(
  actor: Actor,
  order: { id: number; orderNumber: string | null; userId: number; total: number; paymentStatus: string; currency: string },
  input: RequestRefundInput,
): Promise<{ id: number; refundNumber: string; amount: number; status: string; duplicate: boolean }> {
  assertRefundable(order.paymentStatus);
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new HttpError(400, "REASON_REQUIRED", "A refund needs a reason.");
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new HttpError(400, "INVALID_AMOUNT", "A refund of at least one paisa is required.");
  }

  const key = input.idempotencyKey?.trim() || null;
  if (key) {
    const [existing] = await db
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

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ value: sql<number>`COALESCE(SUM(${refunds.amount}), 0)` })
      .from(refunds)
      .where(and(eq(refunds.orderId, order.id), inArray(refunds.status, [...liveRefundStatuses])));
    const already = Number(row?.value ?? 0);
    const remaining = Math.max(0, order.total - already);
    if (input.amount > remaining) {
      throw new HttpError(
        409,
        "EXCEEDS_REFUNDABLE",
        `A refund of ${input.amount} exceeds the ${remaining} still refundable on this order.`,
      );
    }

    const refundNumber = createRefundNumber();
    await tx.insert(refunds).values({
      refundNumber,
      orderId: order.id,
      orderItemId: input.orderItemId ?? null,
      userId: order.userId,
      amount: input.amount,
      currency: order.currency,
      reason,
      status: "PENDING",
      idempotencyKey: key,
      createdBy: actor.id,
    });

    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "REFUND",
      toStatus: "REFUND_REQUESTED",
      actorId: actor.id,
      actorRole: actor.role,
      note: reason,
      metadata: { amount: input.amount, refundNumber },
      eventKey: orderEventKey("REFUND", order.id, refundNumber),
    });

    await notify(tx, {
      userId: order.userId,
      type: "REFUND_REQUESTED",
      title: "A refund is being reviewed",
      body: `A refund of ${(input.amount / 100).toFixed(2)} was requested for order ${order.orderNumber ?? `#${order.id}`}.`,
      context: { orderId: order.id, orderNumber: order.orderNumber },
      eventKey: notificationEventKey("REFUND_REQUESTED", order.id, refundNumber),
    });

    const [created] = await tx
      .select()
      .from(refunds)
      .where(eq(refunds.refundNumber, refundNumber))
      .limit(1);

    return {
      id: created?.id ?? 0,
      refundNumber,
      amount: input.amount,
      status: "PENDING",
      duplicate: false,
    };
  });
}
