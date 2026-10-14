import { Router } from "../lib/http";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders } from "../schema";
import { buildPagination, HttpError, ok } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { requireSeller } from "../lib/seller-access";
import { restoreCancelledOrderStock } from "../lib/product-inventory";
import { recordEarningReversal, recordSaleEarning } from "../lib/wallet";
import { notifyOrderProgress } from "../lib/order-notifications";
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
sellerOrdersRoute.patch(
  "/:id/fulfillment",
  guarded("seller.orders", async (c) => {
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

    // The customer is the other party to this line and cannot see the seller's
    // workspace, so a step that changes what they are waiting for is news to them.
    // The seller's id is the discriminator: in a multi-seller order each seller
    // announcing their own lines must not collapse onto the same notification key.
    const [owner] = await db
      .select({ userId: orders.userId })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (owner) {
      await notifyOrderProgress(db, {
        orderId,
        orderNumber: detail.order.orderNumber,
        userId: owner.userId,
        status: input.status,
        discriminator: user.id,
      });
    }

    // Re-read rather than echoing the request, so the client renders the state the
    // database actually holds.
    return c.json(ok(await getSellerOrder(user.id, orderId)));
  }),
);

/* ---------------------------- bulk fulfillment ----------------------------- */

const bulkFulfillmentSchema = z
  .object({
    references: z.array(z.string().trim().min(1).max(40)).min(1).max(50),
    status: z.string().trim().min(1).max(20),
  })
  .strict();

type BulkFulfillmentTarget = {
  orderId: number;
  orderNumber: string | null;
  userId: number;
  lineIds: number[];
};

/**
 * `PATCH /api/seller/orders/bulk-fulfillment` — move several orders one step.
 *
 * ## Atomic, and that is a deliberate choice
 *
 * Every selected order is re-resolved through the caller's own lines and every
 * line is checked against the state machine **before** anything is written.
 * Either all of the seller's selected orders move, or none do and the response
 * names the order that blocked the batch. A partial apply would leave the list
 * in a state the seller did not choose: some shipped, some not, and no way to
 * tell from the toast which was which. Refusing the whole batch also means the
 * client can present it as a single delayed action with one undo, rather than a
 * mixture of committed and uncommitted rows.
 *
 * ## Why the client delays the call rather than the server holding it
 *
 * The "undo window" lives on the client (see `useUndoWindow`): nothing is sent
 * until the window elapses, so an undo is simply not making the request. No
 * pending-state table, no expiry sweeper, and no window in which the database
 * holds a change its owner has not confirmed.
 */
sellerOrdersRoute.patch(
  "/bulk-fulfillment",
  guarded("seller.orders", async (c) => {
    const user = requireSeller(c);
    const input = bulkFulfillmentSchema.parse(await c.req.json());

    if (!isSellerFulfillmentState(input.status)) {
      throw new HttpError(400, "BAD_REQUEST", "That is not a fulfillment step a seller can set.");
    }

    // Deduplicate first: two references to one order must not double-write its
    // lines or try to record the same earning twice.
    const references = [...new Set(input.references)];

    const targets: BulkFulfillmentTarget[] = [];
    for (const reference of references) {
      // Resolves ownership and 404s for another seller's order in one step.
      const detail = await getSellerOrder(user.id, reference);
      const orderId = detail.order.id;

      if (!detail.actions.canSetFulfillment) {
        throw new HttpError(
          409,
          "INVALID_TRANSITION",
          `${detail.order.orderNumber ?? `#${orderId}`} has no items to fulfil.`,
        );
      }

      const lineStatuses = await db
        .select({ id: orderItems.id, fulfillmentStatus: orderItems.fulfillmentStatus })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, orderId), eq(orderItems.sellerId, user.id)))
        .orderBy(asc(orderItems.id));

      for (const line of lineStatuses) {
        assertFulfillmentTransition(detail.order.status, line.fulfillmentStatus, input.status);
      }

      const [owner] = await db
        .select({ userId: orders.userId })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      targets.push({
        orderId,
        orderNumber: detail.order.orderNumber,
        userId: owner?.userId ?? 0,
        lineIds: lineStatuses.map((line) => line.id),
      });
    }

    await db.transaction(async (tx) => {
      for (const target of targets) {
        await tx
          .update(orderItems)
          .set({ fulfillmentStatus: input.status })
          .where(and(eq(orderItems.orderId, target.orderId), eq(orderItems.sellerId, user.id)));

        // Delivery earns the sale, recorded inside the same transaction as the
        // status change — the single-line reasoning applies unchanged here.
        if (input.status === "DELIVERED") {
          for (const lineId of target.lineIds) {
            await recordSaleEarning(tx, lineId);
          }
        }
      }
    });

    // Notify only after the write commits, so a transaction that rolls back sends
    // nothing. One notification per order, not per line.
    for (const target of targets) {
      if (target.userId <= 0) continue;
      await notifyOrderProgress(db, {
        orderId: target.orderId,
        orderNumber: target.orderNumber,
        userId: target.userId,
        status: input.status,
        discriminator: user.id,
      });
    }

    return c.json(
      ok({
        updated: targets.length,
        references: targets.map((target) => target.orderNumber ?? String(target.orderId)),
      }),
    );
  }),
);

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
sellerOrdersRoute.post(
  "/:id/cancel",
  guarded("seller.orders", async (c) => {
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
        lineStatuses
          .filter((line) => line.fulfillmentStatus === "CANCELLED")
          .map((line) => line.id),
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
  }),
);
