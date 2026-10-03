import { Router } from "../lib/http";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { orderItems } from "../schema";
import { buildPagination, HttpError, ok } from "../lib/api";
import { requireSeller } from "../lib/seller-access";
import { restoreCancelledOrderStock } from "../lib/product-inventory";
import { recordEarningReversal, recordSaleEarning } from "../lib/wallet";
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
export const sellerOrdersRoute = new Router();

sellerOrdersRoute.use("*", async (c, next) => {
  requireSeller(c);
  await next();
});

/* ---------------------------------- list ----------------------------------- */

sellerOrdersRoute.get("/", async (c) => {
  const user = requireSeller(c);
  const filters = resolveSellerOrderFilters(c.req.query());
  const { rows, total } = await listSellerOrders(user.id, filters);

  return c.json(ok(rows, buildPagination(filters.page, filters.pageSize, total)));
});

/* --------------------------------- detail ---------------------------------- */

sellerOrdersRoute.get("/:id", async (c) => {
  const user = requireSeller(c);
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
  const user = requireSeller(c);
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
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, user.id)))
    .orderBy(asc(orderItems.id));

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

    // Delivery is the moment a sale has been earned, so it is where the ledger row
    // is written — inside the same transaction as the status change. Two reasons for
    // one transaction rather than a follow-up write: a crash between them would leave
    // a delivered sale that is permanently missing from the seller's balance, with
    // nothing in either table to point at the cause; and writing it *after* would let
    // a seller who immediately cancelled see a credit that is later unwound for a
    // line they never earned on.
    //
    // The earning is recorded `PENDING`, not `AVAILABLE`. A buyer can still return
    // something, and money that has not cleared the settlement delay is not money a
    // seller can withdraw.
    if (input.status === "DELIVERED") {
      for (const line of lineStatuses) {
        await recordSaleEarning(tx, line.id);
      }
    }
  });

  // Re-read rather than echoing the request, so the client renders the state the
  // database actually holds.
  return c.json(ok(await getSellerOrder(user.id, orderId)));
});

/* -------------------------------- cancellation ------------------------------ */

const cancelSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

/**
 * Cancel the seller's part of an order.
 *
 * Only the caller's lines are touched, so cancelling in a multi-seller order
 * leaves every other seller's lines — and the customer's order status —
 * untouched. No refund is computed or issued here: the payment architecture owns
 * money, and a seller action must never be able to move it.
 */
sellerOrdersRoute.post("/:id/cancel", async (c) => {
  const user = requireSeller(c);
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

    // The units come back. Without this a cancelled purchase left the seller's
    // stock permanently short — the listing stayed "sold out" for an item that
    // was never delivered, and `OUT_OF_STOCK` was the database's honest answer to
    // a counter that had been decremented and never restored.
    await restoreCancelledOrderStock(
      tx,
      orderId,
      lineStatuses.filter((line) => line.fulfillmentStatus === "CANCELLED").map((line) => line.id),
    );

    // Unwind any earning recorded for these lines. Cancellation is only permitted
    // before the goods leave, so in the normal case there is nothing here yet and
    // this is a no-op — which is exactly why it is safe to call unconditionally. It
    // is called because a line that *was* delivered and is then cancelled (a
    // data-migration artefact, or a future path that permits it) must not leave a
    // live credit behind for goods that are coming back.
    for (const line of lineStatuses) {
      await recordEarningReversal(tx, { orderItemId: line.id }, "Order cancelled by the seller");
    }
  });

  return c.json(ok(await getSellerOrder(user.id, orderId)));
});
