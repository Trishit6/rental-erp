import { Hono } from "hono";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { orderItems } from "../schema";
import { buildPagination, HttpError, ok } from "../lib/api";
import { requireUser } from "../lib/auth";
import {
  assertCancellable,
  assertFulfillmentTransition,
  isSellerFulfillmentState,
} from "../lib/order-fulfillment";
import {
  getSellerOrder,
  listSellerOrders,
  resolveSellerOrderFilters,
} from "../lib/seller-order-queries";

/**
 * Seller-side order management.
 *
 * Every handler here derives the seller from the **session** and scopes its
 * query by `order_items.seller_id`. No handler reads a seller/user id from the
 * request body or query string, because a value the client can choose is not an
 * authorization check.
 */
export const sellerOrdersRoute = new Hono();

sellerOrdersRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

/* ---------------------------------- list ----------------------------------- */

sellerOrdersRoute.get("/", async (c) => {
  const user = requireUser(c);
  const filters = resolveSellerOrderFilters(c.req.query());
  const { rows, total } = await listSellerOrders(user.id, filters);

  return c.json(ok(rows, buildPagination(filters.page, filters.pageSize, total)));
});

/* --------------------------------- detail ---------------------------------- */

sellerOrdersRoute.get("/:id", async (c) => {
  const user = requireUser(c);
  const detail = await getSellerOrder(user.id, c.req.param("id"));
  return c.json(ok(detail));
});

/* ------------------------------- fulfillment ------------------------------- */

const fulfillmentSchema = z.object({ status: z.string().trim().min(1).max(20) }).strict();

/**
 * Move the seller's lines of an order forward.
 *
 * The transition is validated **per line** and applied only to lines whose
 * `seller_id` is the caller. A seller whose lines already disagree (one shipped,
 * one processing) gets a refusal that names the state rather than a silent
 * partial update that would leave the order in a state nobody chose.
 */
sellerOrdersRoute.patch("/:id/fulfillment", async (c) => {
  const user = requireUser(c);
  const input = fulfillmentSchema.parse(await c.req.json());
  const reference = c.req.param("id");

  if (!isSellerFulfillmentState(input.status)) {
    throw new HttpError(400, "BAD_REQUEST", "That is not a fulfillment step a seller can set.");
  }

  // Resolves ownership and 404s for another seller's order in one step.
  const detail = await getSellerOrder(user.id, reference);
  const orderId = detail.order.id;
  const orderStatus = detail.order.status;

  if (!detail.actions.canSetFulfillment) {
    throw new HttpError(409, "INVALID_TRANSITION", "This order has no items to fulfil.");
  }

  const lineStatuses = await db
    .select({ id: orderItems.id, fulfillmentStatus: orderItems.fulfillmentStatus })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, user.id)));

  // `assertFulfillmentTransition` resolves the effective state itself, so a line
  // the seller has not touched is judged from the order's status.
  for (const line of lineStatuses) {
    assertFulfillmentTransition(orderStatus, line.fulfillmentStatus, input.status);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orderItems)
      .set({ fulfillmentStatus: input.status })
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, user.id)));
  });

  // Re-read rather than echoing the request, so the client renders the state the
  // database actually holds.
  return c.json(ok(await getSellerOrder(user.id, orderId)));
});

/* -------------------------------- cancellation ------------------------------ */

const cancelSchema = z
  .object({ reason: z.string().trim().min(3).max(300) })
  .strict();

/**
 * Cancel the seller's part of an order.
 *
 * Only the caller's lines are touched, so cancelling in a multi-seller order
 * leaves every other seller's lines — and the customer's order status —
 * untouched. No refund is computed or issued here: the payment architecture owns
 * money, and a seller action must never be able to move it.
 */
sellerOrdersRoute.post("/:id/cancel", async (c) => {
  const user = requireUser(c);
  const input = cancelSchema.parse(await c.req.json());

  const detail = await getSellerOrder(user.id, c.req.param("id"));
  const orderId = detail.order.id;

  const lineStatuses = await db
    .select({ id: orderItems.id, fulfillmentStatus: orderItems.fulfillmentStatus })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, user.id)))
    .orderBy(asc(orderItems.id));

  if (lineStatuses.length === 0) {
    throw new HttpError(404, "NOT_FOUND", "Order not found.");
  }
  for (const line of lineStatuses) {
    assertCancellable(detail.order.status, line.fulfillmentStatus);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orderItems)
      .set({ fulfillmentStatus: "CANCELLED", cancellationReason: input.reason })
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, user.id)));
  });

  return c.json(ok(await getSellerOrder(user.id, orderId)));
});
