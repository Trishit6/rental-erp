import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { orders, refunds, transactions, users } from "../schema";
import { HttpError, paginationQuerySchema } from "./api";
import { REFUND_STATUSES, type ActorRole, type RefundStatus } from "./enums";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";
import { orderEventKey, recordOrderEvent } from "./order-events";
import { getPaymentProvider } from "./payments";
import { createRefundNumber } from "./reference-numbers";
import { recordEarningReversal } from "./wallet";

/**
 * Refund approval and execution (PROMPT 28).
 *
 * ## Request and execution are two different permissions
 *
 * PROMPT 27 let an operator *open* a refund request (`requestOrderRefund`, gated
 * `orders.refund`). This module is the other half: a refund that a finance user
 * approves and the provider executes. Keeping the two apart is what makes the
 * "sum of live refunds ≤ captured" invariant hold at both ends — a request can be
 * queued by support and refused by finance, and no single click both decides and
 * moves money.
 *
 * ## The state machine, and why it is here rather than in the route
 *
 * `PENDING → PROCESSING → SUCCEEDED|FAILED` and `PENDING → CANCELLED` are the only
 * legal shapes. `SUCCEEDED`, `FAILED` and `CANCELLED` are terminal: money that has
 * gone back cannot be "un-refunded" by a second click, and a cancelled request must
 * not be silently revived. The route calls `processAdminRefund`, which reads the row
 * `FOR UPDATE` so two finance users cannot both approve the same refund.
 *
 * ## Why execution is idempotent at the provider
 *
 * The provider call carries a key derived from the refund number. If the process
 * dies after the provider moved the money but before the row was written, the retry
 * presents the same key and the provider returns the original result instead of
 * paying twice. That is the only ordering that is safe without distributed
 * transactions, and it is why the provider call is allowed to sit inside the row
 * lock.
 */

/** A refund in one of these states still counts towards the captured total. */
export const LIVE_REFUND_STATUSES = ["PENDING", "PROCESSING", "SUCCEEDED"] as const;

export const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  PENDING: ["PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"],
  PROCESSING: ["SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function isRefundStatus(value: unknown): value is RefundStatus {
  return typeof value === "string" && (REFUND_STATUSES as readonly string[]).includes(value);
}

export function allowedRefundTransitions(status: string): RefundStatus[] {
  return isRefundStatus(status) ? [...REFUND_TRANSITIONS[status]] : [];
}

export function isRefundTransition(from: string, to: string): boolean {
  return isRefundStatus(from) && isRefundStatus(to) && REFUND_TRANSITIONS[from].includes(to);
}

/* ------------------------------ creation ------------------------------------ */

type RefundExecutor = Pick<typeof db, "select" | "insert" | "update">;

export type RefundRequestInput = {
  orderId: number;
  orderItemId?: number | null;
  transactionId?: number | null;
  /** Who the money goes back to. Server-derived, never the request body. */
  userId: number;
  amount: number;
  currency: string;
  reason: string;
  /**
   * The ceiling this refund is measured against. When omitted it is the order's
   * captured total, read from the ledger — the same number finance approves against.
   */
  captured?: number;
  idempotencyKey?: string | null;
  createdBy?: number | null;
};

export type RefundRequestResult = {
  id: number;
  refundNumber: string;
  amount: number;
  status: string;
  /** True when a refund with this idempotency key already existed. */
  duplicate: boolean;
};

/**
 * Open a refund request. The one writer of a new `refunds` row.
 *
 * Every flow that returns money — an operator's manual refund (PROMPT 27), a
 * rental cancellation, a dispute resolution — goes through here, so the
 * "sum of live refunds ≤ captured" invariant is enforced in exactly one place.
 * The amount is validated against the *live* refunds in the caller's transaction,
 * so two concurrent requests cannot jointly exceed what settled.
 *
 * Idempotent on `idempotencyKey` when one is supplied: the retry returns the row
 * that already exists rather than opening a second one.
 */
export async function createRefundRequest(
  executor: RefundExecutor,
  input: RefundRequestInput,
): Promise<RefundRequestResult> {
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
      transactionId: input.transactionId ?? null,
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
      reason,
      status: "PENDING",
      idempotencyKey: key,
      createdBy: input.createdBy ?? null,
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

export const adminRefundsQuerySchema = paginationQuerySchema.extend({
  status: z.string().trim().optional().catch(undefined),
  search: z.string().trim().max(120).catch("").default(""),
});

export type AdminRefundsQuery = z.infer<typeof adminRefundsQuerySchema>;

export type AdminRefundRow = {
  id: number;
  refundNumber: string;
  status: string;
  amount: number;
  currency: string;
  reason: string | null;
  orderId: number;
  orderNumber: string | null;
  customerName: string;
  providerReference: string | null;
  createdAt: Date;
};

/** The refund queue, newest first, filterable by status and by order/refund number. */
export async function listAdminRefunds(query: AdminRefundsQuery): Promise<{
  rows: AdminRefundRow[];
  total: number;
}> {
  const conditions = [];
  if (isRefundStatus(query.status)) conditions.push(eq(refunds.status, query.status));
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(or(like(refunds.refundNumber, pattern), like(orders.orderNumber, pattern))!);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: refunds.id,
        refundNumber: refunds.refundNumber,
        status: refunds.status,
        amount: refunds.amount,
        currency: refunds.currency,
        reason: refunds.reason,
        orderId: refunds.orderId,
        orderNumber: orders.orderNumber,
        customerName: users.name,
        providerReference: refunds.providerReference,
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .innerJoin(orders, eq(refunds.orderId, orders.id))
      .innerJoin(users, eq(refunds.userId, users.id))
      .where(where)
      .orderBy(desc(refunds.createdAt), desc(refunds.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ value: sql<number>`COUNT(*)` })
      .from(refunds)
      .innerJoin(orders, eq(refunds.orderId, orders.id))
      .where(where),
  ]);

  return { rows, total: Number(totalRow?.value ?? 0) };
}

export type AdminRefundDetail = {
  refund: {
    id: number;
    refundNumber: string;
    status: string;
    amount: number;
    currency: string;
    reason: string | null;
    providerReference: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdByName: string | null;
  };
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    total: number;
    currency: string;
    createdAt: Date;
  };
  customer: { id: number; name: string; email: string };
  /** The captured payment this refund reverses, when one has been attached. */
  transaction: {
    id: number;
    provider: string;
    providerTransactionId: string | null;
    amount: number;
    status: string;
    createdAt: Date;
  } | null;
  /** Total settled against the order, in paise. */
  captured: number;
  /** Still refundable beyond this request, in paise. */
  remaining: number;
  /** The moves the state machine allows from the current status. */
  nextStatuses: string[];
};

export async function getAdminRefundDetail(id: number): Promise<AdminRefundDetail | null> {
  const [row] = await db
    .select({
      id: refunds.id,
      refundNumber: refunds.refundNumber,
      status: refunds.status,
      amount: refunds.amount,
      currency: refunds.currency,
      reason: refunds.reason,
      providerReference: refunds.providerReference,
      transactionId: refunds.transactionId,
      createdBy: refunds.createdBy,
      createdAt: refunds.createdAt,
      updatedAt: refunds.updatedAt,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      orderPaymentStatus: orders.paymentStatus,
      orderTotal: orders.total,
      orderCurrency: orders.currency,
      orderCreatedAt: orders.createdAt,
      customerId: users.id,
      customerName: users.name,
      customerEmail: users.email,
    })
    .from(refunds)
    .innerJoin(orders, eq(refunds.orderId, orders.id))
    .innerJoin(users, eq(refunds.userId, users.id))
    .where(eq(refunds.id, id))
    .limit(1);
  if (!row) return null;

  const [captured, liveSum] = await Promise.all([
    sumCaptured(db, row.orderId),
    sumRefunds(db, row.orderId, LIVE_REFUND_STATUSES),
  ]);

  let createdByName: string | null = null;
  if (row.createdBy) {
    const [creator] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, row.createdBy))
      .limit(1);
    createdByName = creator?.name ?? null;
  }

  let transaction: AdminRefundDetail["transaction"] = null;
  if (row.transactionId) {
    const [txn] = await db
      .select({
        id: transactions.id,
        provider: transactions.provider,
        providerTransactionId: transactions.providerTransactionId,
        amount: transactions.amount,
        status: transactions.status,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(eq(transactions.id, row.transactionId))
      .limit(1);
    transaction = txn ?? null;
  }

  return {
    refund: {
      id: row.id,
      refundNumber: row.refundNumber,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      reason: row.reason,
      providerReference: row.providerReference,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdByName,
    },
    order: {
      id: row.orderId,
      orderNumber: row.orderNumber,
      status: row.orderStatus,
      paymentStatus: row.orderPaymentStatus,
      total: row.orderTotal,
      currency: row.orderCurrency,
      createdAt: row.orderCreatedAt,
    },
    customer: { id: row.customerId, name: row.customerName, email: row.customerEmail },
    transaction,
    captured,
    remaining: Math.max(0, captured - liveSum),
    nextStatuses: allowedRefundTransitions(row.status),
  };
}

export type RefundDecisionInput = {
  decision: "APPROVE" | "REJECT";
  /** An offline reference, used when the provider returns none. */
  providerReference?: string | null;
  reason: string;
};

export type RefundDecisionResult = {
  id: number;
  refundNumber: string;
  status: string;
  providerReference: string | null;
  /** False when the refund was already decided and nothing was replayed. */
  applied: boolean;
};

type Actor = { id: number; role: ActorRole };

/**
 * Approve (execute) or reject a refund request.
 *
 * Rejected: the request is `CANCELLED` and the customer is told.
 * Approved: the captured total is re-read under the row lock, the provider is asked
 * to return the money, and only on a provider `SUCCEEDED` is the row final: the
 * refund is marked `SUCCEEDED`, a `REFUND` transaction is written to the ledger, the
 * order's payment status is recomputed, the seller's earning is reversed, and the
 * customer is notified. Any other outcome marks the row `FAILED` and tells the
 * customer it could not be completed.
 */
export async function processAdminRefund(
  actor: Actor,
  refundId: number,
  input: RefundDecisionInput,
): Promise<RefundDecisionResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new HttpError(400, "REASON_REQUIRED", "A refund decision needs a reason.");
  }

  const provider = getPaymentProvider();
  if (input.decision === "APPROVE" && typeof provider.refundPayment !== "function") {
    throw new HttpError(
      501,
      "REFUNDS_UNAVAILABLE",
      "The configured payment provider cannot return money automatically.",
    );
  }

  return db.transaction(async (tx) => {
    // `FOR UPDATE` so two finance users cannot both approve the same request.
    const [refund] = await tx
      .select()
      .from(refunds)
      .where(eq(refunds.id, refundId))
      .limit(1)
      .for("update");
    if (!refund) throw new HttpError(404, "NOT_FOUND", "Refund not found.");

    const [order] = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(eq(orders.id, refund.orderId))
      .limit(1);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "The refunded order no longer exists.");

    const context = { orderId: order.id, orderNumber: order.orderNumber };

    if (refund.status === "SUCCEEDED") {
      // Idempotent: a second approval of a completed refund reports the same result
      // rather than moving the money again.
      return {
        id: refund.id,
        refundNumber: refund.refundNumber,
        status: refund.status,
        providerReference: refund.providerReference,
        applied: false,
      };
    }
    if (!isRefundTransition(refund.status, input.decision === "REJECT" ? "CANCELLED" : "PROCESSING")) {
      throw new HttpError(
        409,
        "ALREADY_DECIDED",
        `A refund in ${refund.status} can no longer be decided.`,
      );
    }

    if (input.decision === "REJECT") {
      await tx
        .update(refunds)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(refunds.id, refund.id));

      await recordOrderEvent(tx, {
        orderId: order.id,
        type: "REFUND",
        toStatus: "REFUND_REJECTED",
        actorId: actor.id,
        actorRole: actor.role,
        note: reason,
        metadata: { refundNumber: refund.refundNumber, amount: refund.amount },
        eventKey: orderEventKey("REFUND", order.id, `${refund.refundNumber}:rejected`),
      });

      await notify(tx, {
        userId: refund.userId,
        type: "REFUND_REJECTED",
        title: "Your refund request was declined",
        body: `The refund of ${formatPaise(refund.amount)} requested for order ${
          order.orderNumber ?? `#${order.id}`
        } was declined. ${reason}`,
        context,
        eventKey: notificationEventKey("REFUND_REJECTED", order.id, refund.refundNumber),
      });

      return {
        id: refund.id,
        refundNumber: refund.refundNumber,
        status: "CANCELLED",
        providerReference: refund.providerReference,
        applied: true,
      };
    }

    // --- approval ---------------------------------------------------------
    return executeRefund(tx, {
      refund: {
        id: refund.id,
        refundNumber: refund.refundNumber,
        amount: refund.amount,
        currency: refund.currency,
        userId: refund.userId,
        orderItemId: refund.orderItemId,
        providerReference: refund.providerReference,
      },
      order,
      actorId: actor.id,
      actorRole: actor.role,
      reason,
      providerReference: input.providerReference ?? null,
    });
  });
}

/**
 * Execute an approved refund.
 *
 * Provider first, then the row: if the process dies between the two, the retry
 * presents the same `refund-<number>` key and the provider returns its original
 * result instead of paying twice. This is the *single* writer of a successful
 * refund ledger row — an operator approving one and a policy refunding one on
 * cancellation run the same code, so the ledger shape cannot drift between them.
 *
 * Must run inside a transaction holding the refund row `FOR UPDATE`.
 */
export async function executeRefund(
  executor: RefundExecutor,
  input: {
    refund: {
      id: number;
      refundNumber: string;
      amount: number;
      currency: string;
      userId: number;
      orderItemId: number | null;
      providerReference: string | null;
    };
    order: { id: number; orderNumber: string | null; paymentStatus: string };
    actorId: number;
    actorRole: ActorRole;
    reason: string;
    providerReference?: string | null;
  },
): Promise<RefundDecisionResult> {
  const { refund, order } = input;
  const provider = getPaymentProvider();
  if (typeof provider.refundPayment !== "function") {
    throw new HttpError(
      501,
      "REFUNDS_UNAVAILABLE",
      "The configured payment provider cannot return money automatically.",
    );
  }

  const captured = await sumCaptured(executor, order.id);
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

  const result = await provider.refundPayment({
    providerPaymentId: sourceTx.providerTransactionId,
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
      body: `The refund for order ${order.orderNumber ?? `#${order.id}`} could not be completed. ${
        result.failureReason ?? "Please contact support."
      }`,
      context: { orderId: order.id, orderNumber: order.orderNumber },
      eventKey: notificationEventKey("REFUND_REJECTED", order.id, `${refund.refundNumber}:failed`),
    });

    return {
      id: refund.id,
      refundNumber: refund.refundNumber,
      status: "FAILED",
      providerReference,
      applied: true,
    };
  }

  await executor
    .update(refunds)
    .set({
      status: "SUCCEEDED",
      providerReference,
      transactionId: sourceTx.id,
      updatedAt: new Date(),
    })
    .where(eq(refunds.id, refund.id));

  // The customer ledger records the return leg. `amount` stays positive; the type
  // says which direction the money moved. The provider reference is what ties the
  // ledger row to the movement the provider actually made.
  await executor.insert(transactions).values({
    userId: refund.userId,
    orderId: order.id,
    type: "REFUND",
    amount: refund.amount,
    currency: refund.currency,
    status: "SUCCEEDED",
    provider: sourceTx.provider,
    providerTransactionId: providerReference,
    idempotencyKey: `refund-txn-${refund.refundNumber}`,
  });

  const succeededSum = await sumRefunds(executor, order.id, ["SUCCEEDED"]);
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

  await recordOrderEvent(executor, {
    orderId: order.id,
    type: "REFUND",
    toStatus: "REFUND_SUCCEEDED",
    actorId: input.actorId,
    actorRole: input.actorRole,
    note: input.reason,
    metadata: { refundNumber: refund.refundNumber, amount: refund.amount, providerReference },
    eventKey: orderEventKey("REFUND", order.id, `${refund.refundNumber}:succeeded`),
  });

  if (refund.orderItemId) {
    await recordEarningReversal(executor, { orderItemId: refund.orderItemId }, input.reason);
  }

  await notify(executor, {
    userId: refund.userId,
    type: "REFUND_PROCESSED",
    title: "Your refund is on its way",
    body: `${formatPaise(refund.amount)} was refunded for order ${
      order.orderNumber ?? `#${order.id}`
    }.`,
    context: { orderId: order.id, orderNumber: order.orderNumber },
    eventKey: notificationEventKey("REFUND_PROCESSED", order.id, refund.refundNumber),
  });

  return {
    id: refund.id,
    refundNumber: refund.refundNumber,
    status: "SUCCEEDED",
    providerReference,
    applied: true,
  };
}

/* --------------------------------- helpers ---------------------------------- */

type Executor = Pick<typeof db, "select">;

/** What actually settled for this order — the ceiling a refund can never exceed. */
export async function sumCaptured(executor: Executor, orderId: number): Promise<number> {
  const [row] = await executor
    .select({ value: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.orderId, orderId),
        eq(transactions.type, "PAYMENT"),
        eq(transactions.status, "SUCCEEDED"),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function sumRefunds(
  executor: Executor,
  orderId: number,
  statuses: readonly string[],
): Promise<number> {
  const [row] = await executor
    .select({ value: sql<number>`COALESCE(SUM(${refunds.amount}), 0)` })
    .from(refunds)
    .where(and(eq(refunds.orderId, orderId), inArray(refunds.status, [...statuses])));
  return Number(row?.value ?? 0);
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
