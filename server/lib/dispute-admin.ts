import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { disputes, orders, users } from "../schema";
import { HttpError, paginationQuerySchema } from "./api";
import { DISPUTE_STATUSES, type ActorRole, type DisputeStatus } from "./enums";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";
import { requestOrderRefund } from "./order-admin";

/**
 * The dispute queue (PROMPT 27).
 *
 * ## What a decision means
 *
 * A dispute is a disagreement between two parties to an order. The queue's job is
 * to get an operator the *evidence* — who opened it, who it is against, what they
 * said, and the order it concerns — and then to record a decision. Deciding is
 * deliberately two-sided: both the opener and the party they named are told the
 * outcome (`DISPUTE_RESOLVED`), because a resolution only one side hears about is
 * how a second dispute starts.
 *
 * ## Refunds are requests, not movements
 *
 * A resolution may carry a refund, which is opened through `requestOrderRefund` —
 * so it inherits the "never refund more than was captured" invariant, becomes a
 * `PENDING` refund for the finance queue, and lands on the order timeline. The
 * decision itself never moves money.
 */

export const adminDisputesQuerySchema = paginationQuerySchema.extend({
  status: z.string().trim().optional().catch(undefined),
  search: z.string().trim().max(120).catch("").default(""),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
});

export type AdminDisputesQuery = z.infer<typeof adminDisputesQuerySchema>;

export type AdminDisputeRow = {
  id: number;
  disputeNumber: string;
  status: string;
  reason: string;
  orderId: number;
  orderNumber: string | null;
  openerId: number;
  openerName: string;
  againstName: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

export function isDisputeStatus(value: unknown): value is DisputeStatus {
  return typeof value === "string" && (DISPUTE_STATUSES as readonly string[]).includes(value);
}

export async function listAdminDisputes(query: AdminDisputesQuery): Promise<{
  rows: AdminDisputeRow[];
  total: number;
}> {
  const conditions = [];
  if (isDisputeStatus(query.status)) conditions.push(eq(disputes.status, query.status));
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(like(disputes.disputeNumber, pattern), like(orders.orderNumber, pattern))!,
    );
  }
  const from = parseDay(query.from, false);
  const to = parseDay(query.to, true);
  if (from) conditions.push(gte(disputes.createdAt, from));
  if (to) conditions.push(lte(disputes.createdAt, to));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: disputes.id,
        disputeNumber: disputes.disputeNumber,
        status: disputes.status,
        reason: disputes.reason,
        orderId: disputes.orderId,
        orderNumber: orders.orderNumber,
        openerId: disputes.openedBy,
        openerName: users.name,
        againstName: sql<string | null>`(SELECT u.name FROM users u WHERE u.id = ${disputes.againstUserId})`,
        createdAt: disputes.createdAt,
        resolvedAt: disputes.resolvedAt,
      })
      .from(disputes)
      .innerJoin(orders, eq(disputes.orderId, orders.id))
      .innerJoin(users, eq(disputes.openedBy, users.id))
      .where(where)
      .orderBy(desc(disputes.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ value: sql<number>`COUNT(*)` })
      .from(disputes)
      .innerJoin(orders, eq(disputes.orderId, orders.id))
      .where(where),
  ]);

  return { rows, total: Number(totalRow?.value ?? 0) };
}

function parseDay(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(bare ? `${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type AdminDisputeDetail = {
  dispute: {
    id: number;
    disputeNumber: string;
    status: string;
    reason: string;
    description: string | null;
    resolution: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
    resolvedBy: number | null;
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
  opener: { id: number; name: string; email: string };
  against: { id: number; name: string; email: string } | null;
};

export async function getAdminDispute(id: number): Promise<AdminDisputeDetail | null> {
  const [row] = await db
    .select({
      id: disputes.id,
      disputeNumber: disputes.disputeNumber,
      status: disputes.status,
      reason: disputes.reason,
      description: disputes.description,
      resolution: disputes.resolution,
      createdAt: disputes.createdAt,
      resolvedAt: disputes.resolvedAt,
      resolvedBy: disputes.resolvedBy,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      orderPaymentStatus: orders.paymentStatus,
      orderTotal: orders.total,
      orderCurrency: orders.currency,
      orderCreatedAt: orders.createdAt,
      openerId: users.id,
      openerName: users.name,
      openerEmail: users.email,
      againstUserId: disputes.againstUserId,
    })
    .from(disputes)
    .innerJoin(orders, eq(disputes.orderId, orders.id))
    .innerJoin(users, eq(disputes.openedBy, users.id))
    .where(eq(disputes.id, id))
    .limit(1);
  if (!row) return null;

  let against: AdminDisputeDetail["against"] = null;
  if (row.againstUserId) {
    const [party] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, row.againstUserId))
      .limit(1);
    against = party ?? null;
  }

  return {
    dispute: {
      id: row.id,
      disputeNumber: row.disputeNumber,
      status: row.status,
      reason: row.reason,
      description: row.description,
      resolution: row.resolution,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
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
    opener: { id: row.openerId, name: row.openerName, email: row.openerEmail },
    against,
  };
}

type Actor = { id: number; role: ActorRole };

export type DisputeDecision = {
  status: Extract<DisputeStatus, "UNDER_REVIEW" | "RESOLVED" | "DISMISSED">;
  resolution: string;
  refund?: { amount: number; reason: string; idempotencyKey?: string | null } | null;
};

/**
 * Record a decision and tell both sides.
 *
 * `RESOLVED` and `DISMISSED` are terminal and require a resolution note; an
 * optional refund is opened first (so the dispute only reaches its final state if
 * the refund request was valid), then the parties are notified.
 */
export async function decideAdminDispute(
  actor: Actor,
  dispute: { id: number; disputeNumber: string; status: string; orderId: number; openedBy: number; againstUserId: number | null; orderNumber: string | null },
  decision: DisputeDecision,
): Promise<{ appliedRefund: boolean }> {
  const resolution = decision.resolution.trim();
  const terminal = decision.status === "RESOLVED" || decision.status === "DISMISSED";
  if (terminal && resolution.length < 3) {
    throw new HttpError(400, "RESOLUTION_REQUIRED", "A decision needs a written resolution.");
  }
  if (dispute.status === "RESOLVED" || dispute.status === "DISMISSED") {
    throw new HttpError(409, "ALREADY_DECIDED", "This dispute has already been decided.");
  }

  let appliedRefund = false;
  if (decision.refund && decision.refund.amount > 0) {
    const [order] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        userId: orders.userId,
        total: orders.total,
        paymentStatus: orders.paymentStatus,
        currency: orders.currency,
      })
      .from(orders)
      .where(eq(orders.id, dispute.orderId))
      .limit(1);
    if (!order) throw new HttpError(404, "ORDER_NOT_FOUND", "The disputed order no longer exists.");
    await requestOrderRefund(actor, order, {
      amount: decision.refund.amount,
      reason: decision.refund.reason,
      idempotencyKey: decision.refund.idempotencyKey ?? null,
    });
    appliedRefund = true;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(disputes)
      .set({
        status: decision.status,
        resolution: resolution || null,
        resolvedBy: terminal ? actor.id : null,
        resolvedAt: terminal ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(disputes.id, dispute.id));

    if (terminal) {
      const recipientIds = [dispute.openedBy, dispute.againstUserId].filter(
        (userId): userId is number => typeof userId === "number",
      );
      for (const userId of recipientIds) {
        await notify(tx, {
          userId,
          type: "DISPUTE_RESOLVED",
          title: `Dispute ${dispute.disputeNumber} was ${decision.status.toLowerCase()}`,
          body: resolution || "The dispute on your order has been decided.",
          context: { orderId: dispute.orderId, orderNumber: dispute.orderNumber },
          eventKey: notificationEventKey("DISPUTE_RESOLVED", dispute.id, userId),
        });
      }
    }
  });

  return { appliedRefund };
}
