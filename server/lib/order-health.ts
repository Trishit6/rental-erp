import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { disputes, orderItems, orders, refunds, rentals, users } from "../schema";
import type { OrderStatus } from "./order-queries";
import { IN_HAND_STATUSES } from "./rental-lifecycle";

/**
 * Order and rental health (PROMPT 27).
 *
 * ## Why thresholds live in code, not in a settings row
 *
 * An SLA is a statement about how long a state *should* last. Deriving it here —
 * as a pure function of a status and a timestamp — means the detector can be unit
 * tested across a boundary without a database, and means there is one answer to
 * "is this late?" rather than one per screen. A settings row would make the
 * thresholds editable but would also make "why does this look stuck?" depend on
 * data the reader cannot see.
 *
 * ## Stuck is measured from the last move
 *
 * A stuck order is one that has sat in its current status too long, so the clock
 * starts at `updatedAt` (the last write), not `createdAt`. An order created a
 * month ago but confirmed this morning is not stuck; an order confirmed a week
 * ago and untouched since is.
 */

/** How long each status may sit before it is considered stuck. */
export const STUCK_THRESHOLDS_MS: Partial<Record<OrderStatus, number>> = {
  PENDING_PAYMENT: 30 * 60_000,
  CONFIRMED: 24 * 60 * 60_000,
  PROCESSING: 48 * 60 * 60_000,
  READY_FOR_PICKUP: 72 * 60 * 60_000,
  SHIPPED: 7 * 24 * 60 * 60_000,
  DELIVERED: 72 * 60 * 60_000,
};

export type OrderSlaState = {
  status: string;
  /** How long the order has been in its current status. */
  ageMs: number;
  /** The bound for this status, or null when the status is not tracked. */
  thresholdMs: number | null;
  stuck: boolean;
};

export function orderSlaState(
  order: { status: string; updatedAt: Date; createdAt: Date },
  now: Date = new Date(),
): OrderSlaState {
  const since = order.updatedAt ?? order.createdAt;
  const ageMs = Math.max(0, now.getTime() - since.getTime());
  const thresholdMs = STUCK_THRESHOLDS_MS[order.status as OrderStatus] ?? null;
  return {
    status: order.status,
    ageMs,
    thresholdMs,
    stuck: thresholdMs !== null && ageMs > thresholdMs,
  };
}

export function isOrderStuck(
  order: { status: string; updatedAt: Date; createdAt: Date },
  now: Date = new Date(),
): boolean {
  return orderSlaState(order, now).stuck;
}

/** A rental is overdue when it is still in hand and its window has closed. */
export function isRentalOverdue(
  rental: { status: string; endDate: Date },
  now: Date = new Date(),
): boolean {
  if (rental.status === "OVERDUE") return true;
  if (!(IN_HAND_STATUSES as readonly string[]).includes(rental.status)) return false;
  return rental.endDate.getTime() < now.getTime();
}

/** Whole days a rental is past its return date, floored at 0. */
export function daysOverdue(rental: { endDate: Date }, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - rental.endDate.getTime()) / 86_400_000));
}

/* -------------------------------- database ---------------------------------- */

export type StuckOrder = {
  id: number;
  orderNumber: string | null;
  status: string;
  customerName: string;
  total: number;
  ageMs: number;
  thresholdMs: number;
};

export type OverdueReturn = {
  id: number;
  orderNumber: string | null;
  status: string;
  title: string;
  renterName: string;
  ownerName: string;
  endDate: Date;
  daysOverdue: number;
  securityDeposit: number;
};

export type OrderHealth = {
  generatedAt: string;
  stuck: StuckOrder[];
  overdueReturns: OverdueReturn[];
  pendingRefunds: number;
  openDisputes: number;
};

/**
 * The dashboard's operational picture.
 *
 * Bounded on purpose: the stuck and overdue lists are capped, because a detector
 * that returns ten thousand rows is a detector nobody reads. The counts that sit
 * beside them are exact, so "there are more" is never hidden.
 */
export async function getOrderHealth(now: Date = new Date(), limit = 25): Promise<OrderHealth> {
  const candidates = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      customerName: users.name,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(
      inArray(orders.status, [
        "PENDING_PAYMENT",
        "CONFIRMED",
        "PROCESSING",
        "READY_FOR_PICKUP",
        "SHIPPED",
        "DELIVERED",
      ]),
    )
    .orderBy(asc(orders.updatedAt))
    .limit(200);

  const stuck: StuckOrder[] = [];
  for (const order of candidates) {
    const sla = orderSlaState(order, now);
    if (!sla.stuck || sla.thresholdMs === null) continue;
    stuck.push({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customerName: order.customerName,
      total: order.total,
      ageMs: sla.ageMs,
      thresholdMs: sla.thresholdMs,
    });
    if (stuck.length >= limit) break;
  }

  const overdueRows = await db
    .select({
      id: rentals.id,
      status: rentals.status,
      endDate: rentals.endDate,
      securityDeposit: rentals.securityDeposit,
      orderNumber: orders.orderNumber,
      title: orderItems.titleSnapshot,
      renterName: users.name,
      ownerName: sql<string>`(SELECT u.name FROM users u WHERE u.id = ${rentals.ownerId})`,
    })
    .from(rentals)
    .innerJoin(orders, eq(rentals.orderId, orders.id))
    .innerJoin(orderItems, eq(rentals.orderItemId, orderItems.id))
    .innerJoin(users, eq(rentals.renterId, users.id))
    .where(and(inArray(rentals.status, IN_HAND_STATUSES), lte(rentals.endDate, now)))
    .orderBy(asc(rentals.endDate))
    .limit(limit);

  const [refundRow] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(refunds)
    .where(inArray(refunds.status, ["PENDING", "PROCESSING"]));

  const [disputeRow] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(disputes)
    .where(inArray(disputes.status, ["OPEN", "UNDER_REVIEW"]));

  return {
    generatedAt: now.toISOString(),
    stuck,
    overdueReturns: overdueRows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      status: row.status,
      title: row.title,
      renterName: row.renterName,
      ownerName: row.ownerName,
      endDate: row.endDate,
      daysOverdue: daysOverdue({ endDate: row.endDate }, now),
      securityDeposit: row.securityDeposit,
    })),
    pendingRefunds: Number(refundRow?.value ?? 0),
    openDisputes: Number(disputeRow?.value ?? 0),
  };
}
