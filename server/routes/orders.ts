import { Router } from "../lib/http";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  orderItems,
  orders,
  products,
  rentalEvents,
  rentals,
  transactions,
  users,
} from "../schema";
import { buildPagination, fail, ok, HttpError } from "../lib/api";
import { parseAddressSnapshot } from "../lib/address-snapshot";
import { requireUser } from "../lib/auth";
import {
  buildOrderListFilters,
  buildOrderListSort,
  resolveOrderFilters,
} from "../lib/order-queries";
import {
  buildRentalFilters,
  buildRentalSort,
  rentalRoleCondition,
  resolveRentalFilters,
} from "../lib/rental-queries";
import { checkReviewEligibility, purchaseTypeForLine } from "../lib/review-queries";
import {
  addRentalDays,
  buildRentalTimeline,
  depositStatus,
  reconcileRentalStatuses,
  recordRentalEvent,
  rentalBucket,
  rentalDaysUntil,
  type RentalStatus,
} from "../lib/rental-lifecycle";
import { assertRentalAvailability, overlappingRentalCount } from "../lib/rental-availability";
import { effectiveDailyRate, rentalDays } from "../../src/lib/pricing";
import {
  checkCustomerCancellation,
  cancellationRefusalError,
  isCancellationReason,
} from "../lib/order-cancellation";
import { getOrCreateCart, mergeCartItem } from "../lib/cart";
import { adjustProductInventory, restoreCancelledOrderStock } from "../lib/product-inventory";
import { isPurchasable } from "../lib/product-status";
import { recordEarningReversal, recordRentalEarning } from "../lib/wallet";
import { notificationEventKey } from "../lib/notification-events";
import { notify, notifyAdmins, notifyMany } from "../lib/notifications";

/** The input shape `mergeCartItem` accepts for one repeated line. */
type RepeatCartInput = {
  productId: number;
  mode: "BUY" | "RENT";
  quantity: number;
  startDate?: string;
  endDate?: string;
};

export const ordersRoute = new Router();
export const rentalsRoute = new Router();

/* ------------------------------ availability ------------------------------- */
// The engine itself lives in `server/lib/rental-availability.ts` so orders, the
// cart and the product page all validate rentals against the same rules.
export { assertRentalAvailability, overlappingRentalCount };

ordersRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

/**
 * Creating an order is no longer something a client can do directly.
 *
 * This used to accept a list of items from the browser and immediately write a
 * `PAID` order, which meant an order could exist with no payment behind it and
 * no server-side verification of what was owed. Orders are now created only by
 * `createOrderFromPayment`, after a provider has confirmed the payment.
 *
 * 410 rather than 404 so a client with a stale build gets a useful instruction
 * instead of a confusing "not found".
 */
ordersRoute.post("/", (c) =>
  c.json(
    fail(
      "ORDER_CREATION_REQUIRES_PAYMENT",
      "Orders are created by the payment flow. Start at /api/payments/intents.",
    ),
    410,
  ),
);

/* -------------------------------- list mine -------------------------------- */

/**
 * The customer's orders, filtered, searched, sorted and paginated.
 *
 * Everything is done in SQL rather than by reading the user's whole history and
 * filtering in the browser: order history grows without bound, and "search"
 * that only sees the current page is worse than no search at all.
 */
ordersRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const filters = resolveOrderFilters(c.req.query());
  const where = buildOrderListFilters(filters);

  // Count and page share the same predicate, so the total always describes the
  // result set the customer is actually looking at.
  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(orders)
    .where(and(eq(orders.userId, user.id), where));

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      depositTotal: orders.depositTotal,
      discount: orders.discount,
      tax: orders.tax,
      total: orders.total,
      currency: orders.currency,
      deliveryMethod: orders.deliveryMethod,
      trackingNumber: orders.trackingNumber,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(eq(orders.userId, user.id), where))
    .orderBy(...buildOrderListSort(filters.sort))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const orderIds = rows.map((row) => row.id);
  const previews = await loadOrderPreviews(orderIds);

  const data = rows.map((row) => ({
    ...row,
    ...(previews.get(row.id) ?? {
      itemCount: 0,
      preview: null,
      sellers: [],
      rentalStatus: null,
      rentalEndDate: null,
    }),
  }));

  return c.json(ok(data, buildPagination(filters.page, filters.pageSize, Number(total))));
});

/* ------------------------------ detail (mine) ------------------------------ */

/**
 * One order in full.
 *
 * Scoped by `userId` in the same WHERE as the id, so another customer's order
 * is indistinguishable from a non-existent one — a 403 would confirm the id
 * exists. That is the whole IDOR defence and it lives here, not in the client.
 *
 * Items are `leftJoin`ed to products and the *snapshot* is what gets displayed.
 * An inner join would make an order line vanish the moment its product row was
 * removed, turning a historical receipt into a partial one.
 */
ordersRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const raw = c.req.param("id");

  // The route accepts either the internal id or the public `RV-2026-XXXXXX`
  // number. The UI always links with the number — a URL is user-visible and
  // shareable, so it must not carry the sequential database id.
  const isOrderNumber = /^RV-\d{4}-[A-Z0-9]{6}$/i.test(raw);
  const numericId = Number(raw);
  if (!isOrderNumber && (!Number.isInteger(numericId) || numericId <= 0)) {
    throw new HttpError(404, "NOT_FOUND", "Order not found.");
  }

  // Ownership is part of the same predicate as the identifier, so another
  // customer's order is indistinguishable from one that does not exist. A 403
  // would confirm the identifier is real, which is exactly what an IDOR probe
  // is looking for.
  const identifier = isOrderNumber
    ? eq(orders.orderNumber, raw.toUpperCase())
    : eq(orders.id, numericId);

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      depositTotal: orders.depositTotal,
      discount: orders.discount,
      tax: orders.tax,
      total: orders.total,
      currency: orders.currency,
      deliveryMethod: orders.deliveryMethod,
      deliveryAddressSnapshot: orders.deliveryAddressSnapshot,
      trackingNumber: orders.trackingNumber,
      paymentProvider: orders.paymentProvider,
      paymentReference: orders.paymentReference,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(and(identifier, eq(orders.userId, user.id)))
    .limit(1);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found.");

  const orderId = order.id;

  const items = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      sellerId: orderItems.sellerId,
      mode: orderItems.mode,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      rentalCharge: orderItems.rentalCharge,
      securityDeposit: orderItems.securityDeposit,
      lineTotal: orderItems.lineTotal,
      titleSnapshot: orderItems.titleSnapshot,
      imageSnapshot: orderItems.imageSnapshot,
      startDate: orderItems.startDate,
      /** Set when the line already carries a review — Edit instead of Write. */
      existingReviewId: sql<number | null>`(
        SELECT r.id FROM reviews r WHERE r.order_item_id = ${orderItems.id} LIMIT 1
      )`,
      endDate: orderItems.endDate,
      rentalDays: orderItems.rentalDays,
      rentCreditApplied: orderItems.rentCreditApplied,
      // Live, navigation-only fields. `leftJoin` so a removed product degrades
      // to "no link and no condition" instead of dropping the line.
      productSlug: products.slug,
      condition: products.condition,
      listingType: products.listingType,
      liveImage: sql<string | null>`(
        SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id}
        ORDER BY pi.sort_order ASC LIMIT 1
      )`,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.id);

  const [rentalsForOrder, payments, sellers] = await Promise.all([
    db
      .select({
        id: rentals.id,
        orderItemId: rentals.orderItemId,
        productId: rentals.productId,
        startDate: rentals.startDate,
        endDate: rentals.endDate,
        actualReturnDate: rentals.actualReturnDate,
        dailyRate: rentals.dailyRate,
        rentalSubtotal: rentals.rentalSubtotal,
        securityDeposit: rentals.securityDeposit,
        rentCreditApplied: rentals.rentCreditApplied,
        status: rentals.status,
      })
      .from(rentals)
      .where(eq(rentals.orderId, orderId)),
    // Only what a customer may see. No credentials, no raw payloads.
    db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        currency: transactions.currency,
        status: transactions.status,
        provider: transactions.provider,
        providerTransactionId: transactions.providerTransactionId,
        paymentMethod: transactions.paymentMethod,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(and(eq(transactions.orderId, orderId), eq(transactions.type, "PAYMENT")))
      .orderBy(desc(transactions.createdAt)),
    loadSellers([...new Set(items.map((item) => item.sellerId))]),
  ]);

  /**
   * Per-line review state, resolved here rather than in the client.
   *
   * The order page is the natural place someone arrives to write a review, so the
   * "Review Product" button is driven by this block instead of the browser
   * re-deriving the rule. It is the *same* `checkReviewEligibility` the
   * `POST /reviews` guard uses, so a button that is shown is a submission the
   * server will accept — and one that is hidden hides for the reason stated in
   * `reason`, which is a sentence rather than a missing control.
   */
  const rentalByItem = new Map(
    rentalsForOrder.filter((row) => row.orderItemId).map((row) => [row.orderItemId!, row]),
  );

  return c.json(
    ok({
      order: {
        ...order,
        deliveryAddressSnapshot: parseAddressSnapshot(order.deliveryAddressSnapshot),
      },
      // `imageUrl` prefers the purchase-time snapshot and only falls back to the
      // product's current image. The internal columns are dropped so the client
      // has one field to render and cannot accidentally show the wrong one.
      items: items.map(({ imageSnapshot, liveImage, existingReviewId, ...item }) => {
        const rental = rentalByItem.get(item.id);
        const purchaseType = purchaseTypeForLine({ mode: item.mode, rentalId: rental?.id });
        const check = checkReviewEligibility({
          purchaseType,
          orderStatus: order.status,
          rentalStatus: rental?.status,
          alreadyReviewed: existingReviewId !== null,
        });

        return {
          ...item,
          imageUrl: imageSnapshot ?? liveImage,
          review: {
            purchaseType,
            eligible: check.eligible,
            reason: check.eligible ? null : check.message,
            reviewId: existingReviewId ? Number(existingReviewId) : null,
          },
        };
      }),
      rentals: rentalsForOrder,
      payment: payments[0] ?? null,
      payments,
      sellers,
    }),
  );
});

/* ------------------------------- cancellation ------------------------------ */

/**
 * Why the customer is cancelling. The vocabulary lives in
 * `server/lib/order-cancellation.ts` beside the state machine, so the dialog's
 * options and the column's allowed values cannot drift.
 */
const cancelOrderSchema = z
  .object({
    reason: z.string().trim().max(300).optional(),
    /** One of `CANCELLATION_REASONS` when the client sends the structured choice. */
    reasonCode: z.string().trim().max(40).optional(),
  })
  .strict();

/**
 * The customer cancels their own order.
 *
 * Ownership is in the lookup predicate (another customer's order is the same
 * 404 as a missing one) and the state machine decides *whether* a cancellation
 * is possible at all — the client's Cancel button is a courtesy, never the
 * rule. Allowed only before the goods have left; a started rental blocks it.
 *
 * The write is one transaction: status + reason on the order, a refund-shaped
 * ledger row for a paid order, and a notification per affected seller, so a
 * partial failure can never leave a cancelled order that nobody was told about.
 * As elsewhere, the REFUND transaction records that the *settlement* is owed —
 * actually moving money stays with the payment architecture.
 */
ordersRoute.post("/:id/cancel", async (c) => {
  const user = c.get("user")!;
  const raw = c.req.param("id");
  const input = cancelOrderSchema.parse(await c.req.json().catch(() => ({})));

  const isOrderNumber = /^RV-\d{4}-[A-Z0-9]{6}$/i.test(raw);
  const numericId = Number(raw);
  if (!isOrderNumber && (!Number.isInteger(numericId) || numericId <= 0)) {
    throw new HttpError(404, "NOT_FOUND", "Order not found.");
  }
  const identifier = isOrderNumber
    ? eq(orders.orderNumber, raw.toUpperCase())
    : eq(orders.id, numericId);

  const [order] = await db
    .select()
    .from(orders)
    .where(and(identifier, eq(orders.userId, user.id)))
    .limit(1);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found.");

  // Any rental that has gone active means the item is physically out — too late.
  const [{ activeRentals }] = await db
    .select({ activeRentals: sql<number>`COUNT(*)` })
    .from(rentals)
    .where(
      and(
        eq(rentals.orderId, order.id),
        inArray(rentals.status, ["ACTIVE", "RETURN_PENDING", "OVERDUE", "RETURNED"]),
      ),
    );

  const check = checkCustomerCancellation({
    status: order.status,
    paymentStatus: order.paymentStatus,
    hasActiveRental: Number(activeRentals) > 0,
  });
  if (!check.allowed) throw cancellationRefusalError(check);

  // A free-text reason is optional; a structured one is validated against the
  // known vocabulary and stored in a readable form either way.
  const reasonText = input.reason?.trim()
    ? input.reason.trim().slice(0, 300)
    : input.reasonCode && isCancellationReason(input.reasonCode)
      ? input.reasonCode.replace(/_/g, " ").toLowerCase()
      : "Cancelled by customer";

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(eq(orders.id, order.id));

    // Every untouched line records why it stopped; lines a seller already
    // cancelled keep their own reason. The ids of those already-cancelled lines
    // are collected first, because their stock was returned when *they* were
    // cancelled and must not be returned a second time here.
    const alreadyCancelled = await tx
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, order.id), eq(orderItems.fulfillmentStatus, "CANCELLED")));

    await tx
      .update(orderItems)
      .set({ fulfillmentStatus: "CANCELLED", cancellationReason: reasonText })
      .where(and(eq(orderItems.orderId, order.id), isNull(orderItems.fulfillmentStatus)));

    // Purchased units go back on the shelf. A rental holds its unit for a date
    // window rather than removing it from stock, so it has nothing to give back.
    await restoreCancelledOrderStock(
      tx,
      order.id,
      alreadyCancelled.map((row) => row.id),
    );

    // Ledger row for the refund owed. No gateway call happens here — the
    // payment architecture owns settlement — but the money story is on record.
    if (order.paymentStatus === "PAID") {
      await tx.insert(transactions).values({
        userId: user.id,
        orderId: order.id,
        type: "REFUND",
        amount: order.total,
        status: "PENDING",
        provider: order.paymentProvider,
        providerTransactionId: `cancel_${order.orderNumber ?? order.id}`,
      });
    }

    // The seller's ledger is unwound too. Cancellation is only allowed before the goods
    // leave, so a *sale* earning — recorded at delivery — normally does not exist yet
    // and this is a no-op; a *rental* earning, recorded only at return, would exist
    // for a booking already returned, and that one must not survive the order being
    // cancelled. Both calls find nothing when there is nothing to unwind, which is
    // what makes it safe to run them for every affected line rather than trying to
    // work out up front which lines have money behind them.
    const affectedLines = await tx
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    for (const line of affectedLines) {
      await recordEarningReversal(tx, { orderItemId: line.id }, "Order cancelled by the customer");
    }

    const affectedRentals = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.orderId, order.id));
    for (const rental of affectedRentals) {
      await recordEarningReversal(tx, { rentalId: rental.id }, "Order cancelled by the customer");
    }

    const sellerRows = await tx
      .selectDistinct({ sellerId: orderItems.sellerId })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    const sellerIds = sellerRows.map((row) => row.sellerId).filter((id) => id !== order.userId);

    // Everyone the cancellation touches hears about it, each with their own copy of the
    // facts: the customer wants confirmation (and, if they paid, the refund's status),
    // and each seller needs to know stock and earnings were walked back. One
    // `notifyMany` so the recipients' preferences are resolved once for the batch.
    const context = { orderId: order.id, orderNumber: order.orderNumber ?? null };
    const orderLabel = order.orderNumber ?? `#${order.id}`;
    await notifyMany(tx, [
      {
        userId: order.userId,
        type: "ORDER_CANCELLED",
        title: "Order cancelled",
        body: `Order ${orderLabel} was cancelled.`,
        context,
        eventKey: notificationEventKey("ORDER_CANCELLED", order.id, order.userId),
      },
      ...sellerIds.map((sellerId) => ({
        userId: sellerId,
        type: "ORDER_CANCELLED" as const,
        title: "Order cancelled",
        body: `Order ${orderLabel} was cancelled by the customer.`,
        context,
        eventKey: notificationEventKey("ORDER_CANCELLED", order.id, sellerId),
        link: "/dashboard/orders",
      })),
    ]);

    // A paid order that is cancelled leaves money in flight. The refund row was just
    // written as PENDING (or the customer is told to expect one), so the customer is
    // told what happens next and an administrator owns the follow-up. Keyed on the
    // cancellation, not on the order, so a second cancellation attempt cannot produce
    // a second refund request — though the status guard above means it should not
    // reach here at all.
    if (order.paymentStatus === "PAID") {
      await notify(tx, {
        userId: order.userId,
        type: "REFUND_REQUESTED",
        title: "Refund started",
        body: `A refund for order ${orderLabel} has been started and will return to your original payment method.`,
        context,
        eventKey: notificationEventKey("REFUND_REQUESTED", order.id, order.userId),
      });
      await notifyAdmins(tx, {
        type: "ADMIN_REFUND_REQUEST",
        title: "Refund needs review",
        body: `Order ${orderLabel} was cancelled after payment and needs a refund review.`,
        context,
        relatedEntityType: "ORDER",
        relatedEntityId: order.id,
        eventKey: notificationEventKey("ADMIN_REFUND_REQUEST", order.id),
      });
    }
  });

  return c.json(ok({ cancelled: true, orderId: order.id, status: "CANCELLED" as const }));
});

/* --------------------------- buy again / rent again ------------------------ */

const orderAgainSchema = z
  .object({
    /** Which line of the order to repeat. Defaults to the first repeatable one. */
    orderItemId: z.number().int().positive().optional(),
  })
  .strict();

/** What a repeatable line needs from its product *as it is now*. */
type RepeatableProduct = {
  id: number;
  slug: string;
  title: string;
  status: string;
  sellerId: number;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  availableQuantity: number;
};

/**
 * Build the cart payload for repeating one line, or say precisely why not.
 *
 * Money comes from the product's *current* prices via `priceCartLine` — never
 * from the historical line — so a repeat at yesterday's price is impossible and
 * a price change is honoured. Availability uses the same engine checkout uses.
 */
async function buildRepeatInput(
  line: {
    id: number;
    mode: string;
    quantity: number;
    startDate: Date | null;
    endDate: Date | null;
  },
  product: RepeatableProduct,
  buyerId: number,
): Promise<{ ok: true; input: RepeatCartInput } | { ok: false; code: string; message: string }> {
  if (!isPurchasable(product.status)) {
    return {
      ok: false,
      code: "PRODUCT_UNAVAILABLE",
      message: "This product is no longer available.",
    };
  }
  if (product.sellerId === buyerId) {
    return { ok: false, code: "OWN_LISTING", message: "This is your own listing." };
  }
  if (product.availableQuantity < 1) {
    return { ok: false, code: "PRODUCT_UNAVAILABLE", message: "This item is out of stock." };
  }

  if (line.mode === "BUY") {
    if (!product.purchasePrice) {
      return { ok: false, code: "MODE_UNSUPPORTED", message: "This item is no longer for sale." };
    }
    return {
      ok: true,
      input: {
        productId: product.id,
        mode: "BUY",
        quantity: Math.min(line.quantity, product.availableQuantity),
      },
    };
  }

  // Rental repeat: the original window, re-validated against today's bookings.
  if (!line.startDate || !line.endDate || !product.rentalPricePerDay) {
    return { ok: false, code: "RENTAL_UNAVAILABLE", message: "This item can no longer be rented." };
  }
  const days = rentalDays({ startDate: line.startDate, endDate: line.endDate });
  if (product.minimumRentalDays && days < product.minimumRentalDays) {
    return {
      ok: false,
      code: "MIN_DAYS",
      message: `The minimum rental for this item is ${product.minimumRentalDays} days.`,
    };
  }
  if (product.maximumRentalDays && days > product.maximumRentalDays) {
    return {
      ok: false,
      code: "MAX_DAYS",
      message: `The maximum rental for this item is ${product.maximumRentalDays} days.`,
    };
  }
  try {
    await assertRentalAvailability(product.id, 1, line.startDate, line.endDate);
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        ok: false,
        code: "RENTAL_UNAVAILABLE",
        message: "Those dates are no longer available.",
      };
    }
    throw error;
  }
  return {
    ok: true,
    input: {
      productId: product.id,
      mode: "RENT",
      quantity: 1,
      startDate: line.startDate.toISOString(),
      endDate: line.endDate.toISOString(),
    },
  };
}

/**
 * Repeat an order line: "Buy again" for a purchase, "Rent again" for a rental.
 *
 * The server, not the card's button, decides what is repeatable: the product
 * must still be listed, purchasable and (for a rental) available for the same
 * window. Everything the cart needs is derived from the product *as it is now*
 * — prices are never copied out of the historical line, so a price change since
 * the original order is honoured, not silently reverted.
 *
 * The cart merge (`mergeCartItem`) runs in its own locked transaction, so a
 * double-click adds one line, not two.
 */
ordersRoute.post("/:id/again", async (c) => {
  const user = c.get("user")!;
  const raw = c.req.param("id");
  const input = orderAgainSchema.parse(await c.req.json().catch(() => ({})));

  const isOrderNumber = /^RV-\d{4}-[A-Z0-9]{6}$/i.test(raw);
  const numericId = Number(raw);
  if (!isOrderNumber && (!Number.isInteger(numericId) || numericId <= 0)) {
    throw new HttpError(404, "NOT_FOUND", "Order not found.");
  }
  const identifier = isOrderNumber
    ? eq(orders.orderNumber, raw.toUpperCase())
    : eq(orders.id, numericId);

  // The order must belong to the caller; the *line* must belong to that order.
  // Both predicates in the same WHERE keeps the endpoint from being probed.
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(identifier, eq(orders.userId, user.id)))
    .limit(1);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found.");

  const lines = await db
    .select({
      id: orderItems.id,
      mode: orderItems.mode,
      quantity: orderItems.quantity,
      startDate: orderItems.startDate,
      endDate: orderItems.endDate,
      product: {
        id: products.id,
        slug: products.slug,
        title: products.title,
        status: products.status,
        sellerId: products.sellerId,
        purchasePrice: products.purchasePrice,
        rentalPricePerDay: products.rentalPricePerDay,
        rentalPricePerWeek: products.rentalPricePerWeek,
        rentalPricePerMonth: products.rentalPricePerMonth,
        securityDeposit: products.securityDeposit,
        minimumRentalDays: products.minimumRentalDays,
        maximumRentalDays: products.maximumRentalDays,
        availableQuantity: products.availableQuantity,
      },
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.id));

  const line = input.orderItemId
    ? lines.find((candidate) => candidate.id === input.orderItemId)
    : lines[0];
  if (!line) throw new HttpError(404, "NOT_FOUND", "That item is not part of this order.");

  const repeat = await buildRepeatInput(line, line.product, user.id);
  if (!repeat.ok) {
    throw new HttpError(409, repeat.code, repeat.message);
  }

  // The cart write owns its transaction and its merge rule.
  const cartId = await getOrCreateCart(user.id);
  const result = await mergeCartItem({
    cartId,
    productId: repeat.input.productId,
    mode: repeat.input.mode,
    quantity: repeat.input.quantity,
    startDate: repeat.input.startDate ? new Date(repeat.input.startDate) : null,
    endDate: repeat.input.endDate ? new Date(repeat.input.endDate) : null,
    // A repeated line is an active cart line — never a saved-for-later one.
    savedForLater: false,
    // Snapshot the *current* price, never the historical line price (see
    // `buildRepeatInput`). The snapshot only exists so a later price change is
    // *shown* in the cart rather than silently charged at checkout.
    unitPriceSnapshot:
      repeat.input.mode === "RENT"
        ? line.product.rentalPricePerDay
        : (line.product.purchasePrice ?? null),
  });

  return c.json(
    ok({
      added: true,
      merged: result.merged,
      itemId: result.itemId,
      productId: repeat.input.productId,
      mode: repeat.input.mode,
    }),
  );
});

/* --------------------------- response helpers ------------------------------ */

type OrderPreviewRow = {
  id: number;
  titleSnapshot: string;
  imageSnapshot: string | null;
  mode: string;
};

/**
 * Per-order card data for a page of orders: how many lines, which product to
 * show, and who sold it.
 *
 * One query for the page rather than one per order, so a 20-order page is three
 * round trips instead of sixty.
 */
async function loadOrderPreviews(orderIds: number[]) {
  const map = new Map<
    number,
    {
      itemCount: number;
      preview: { title: string; imageUrl: string | null; mode: string } | null;
      sellers: { id: number; name: string; avatarUrl: string | null; verified: boolean }[];
      rentalStatus: string | null;
      rentalEndDate: Date | null;
    }
  >();
  if (orderIds.length === 0) return map;

  const items: (OrderPreviewRow & { orderId: number; sellerId: number })[] = await db
    .select({
      orderId: orderItems.orderId,
      id: orderItems.id,
      titleSnapshot: orderItems.titleSnapshot,
      imageSnapshot: orderItems.imageSnapshot,
      mode: orderItems.mode,
      sellerId: orderItems.sellerId,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.orderId), asc(orderItems.id));

  const rentalRows = await db
    .select({
      orderId: rentals.orderId,
      status: rentals.status,
      endDate: rentals.endDate,
      startDate: rentals.startDate,
    })
    .from(rentals)
    .where(inArray(rentals.orderId, orderIds))
    .orderBy(asc(rentals.startDate));

  const sellerIds = [...new Set(items.map((item) => item.sellerId))];
  const sellerMap = await loadSellers(sellerIds);

  for (const orderId of orderIds) {
    const orderItemsForOrder = items.filter((item) => item.orderId === orderId);
    const first = orderItemsForOrder[0];
    const orderSellers = [...new Set(orderItemsForOrder.map((item) => item.sellerId))]
      .map((sellerId) => sellerMap.find((s) => s.id === sellerId))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));

    // The soonest relevant rental is the one a customer cares about: if any of
    // an order's rentals is active or overdue, the card should say so.
    const orderRentals = rentalRows.filter((r) => r.orderId === orderId);
    const activeRental =
      orderRentals.find((r) => r.status === "OVERDUE") ??
      orderRentals.find((r) => r.status === "ACTIVE") ??
      orderRentals.find((r) => r.status === "CONFIRMED") ??
      orderRentals[0] ??
      null;

    map.set(orderId, {
      itemCount: orderItemsForOrder.length,
      preview: first
        ? { title: first.titleSnapshot, imageUrl: first.imageSnapshot, mode: first.mode }
        : null,
      sellers: orderSellers,
      rentalStatus: activeRental?.status ?? null,
      rentalEndDate: activeRental?.endDate ?? null,
    });
  }

  return map;
}

/** Public seller fields only — never email, phone or anything private. */
async function loadSellers(sellerIds: number[]) {
  if (sellerIds.length === 0) return [];
  return db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      verified: users.verified,
    })
    .from(users)
    .where(inArray(users.id, sellerIds));
}

/**
 * Add the derived fields a rental UI needs, so the client never has to infer
 * state from dates.
 *
 * `bucket` and `depositStatus` in particular are decisions, not formatting: a
 * countdown that decided for itself whether a rental was active would let two
 * clients disagree with the server about what is happening.
 */
function decorateRental<
  T extends { status: string; startDate: Date; endDate: Date; securityDeposit: number },
>(row: T) {
  // A status this build does not know is reported as-is rather than coerced to a
  // default, so an unfamiliar state is visible instead of silently mislabelled.
  const status = row.status as RentalStatus;
  const days = rentalDays({ startDate: row.startDate, endDate: row.endDate });
  const bucket = rentalBucket(status, row.startDate);

  return {
    ...row,
    status,
    days,
    bucket,
    depositStatus: depositStatus(status, row.securityDeposit),
    daysRemaining: rentalDaysUntil(new Date(), row.endDate),
    isInHand: status === "ACTIVE" || status === "RETURN_PENDING" || status === "OVERDUE",
  };
}

/* --------------------------------- rentals --------------------------------- */

rentalsRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

/**
 * The renter's rentals — searchable, filterable, sortable, optionally paged.
 *
 * Before anything is read, dates are reconciled into status (`CONFIRMED` whose
 * start day has arrived becomes `ACTIVE`; a past-due `ACTIVE` becomes
 * `OVERDUE`). That keeps the server authoritative: a customer leaving a tab open
 * overnight cannot advance their own rental, and two clients cannot disagree.
 *
 * Scope is explicit. `role=renter` (the default) is "the ones I booked", which
 * is what this customer-facing list means. The dashboard surfaces call
 * `role=all` because they have always shown both sides of the table, and the
 * pagination below is opt-in for the same reason — capping them at one page
 * would drop rows with no visible error.
 */
rentalsRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const filters = resolveRentalFilters(c.req.query());

  await reconcileRentalStatuses(db, {
    renterId: filters.role === "owner" ? undefined : user.id,
    ownerId: filters.role === "renter" ? undefined : user.id,
  });

  const where = and(rentalRoleCondition(user.id, filters.role), buildRentalFilters(filters));

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(rentals)
    .where(where);

  let query = db
    .select({
      id: rentals.id,
      orderId: rentals.orderId,
      productId: rentals.productId,
      startDate: rentals.startDate,
      endDate: rentals.endDate,
      actualReturnDate: rentals.actualReturnDate,
      dailyRate: rentals.dailyRate,
      rentalSubtotal: rentals.rentalSubtotal,
      securityDeposit: rentals.securityDeposit,
      deliveryFee: rentals.deliveryFee,
      total: rentals.total,
      status: rentals.status,
      rentCreditApplied: rentals.rentCreditApplied,
      returnRequestedAt: rentals.returnRequestedAt,
      completedAt: rentals.completedAt,
      extensionRequestedAt: rentals.extensionRequestedAt,
      extensionRequestedDays: rentals.extensionRequestedDays,
      renterId: rentals.renterId,
      ownerId: rentals.ownerId,
      createdAt: rentals.createdAt,
      title: products.title,
      productSlug: products.slug,
      condition: products.condition,
      listingType: products.listingType,
      primaryImage: sql<string | null>`(
        SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id}
        ORDER BY pi.sort_order ASC LIMIT 1
      )`,
      orderNumber: orders.orderNumber,
      deliveryMethod: orders.deliveryMethod,
      orderItemTitle: orderItems.titleSnapshot,
      orderItemImage: orderItems.imageSnapshot,
      // Public seller fields only, joined in so a card can show "rented from"
      // without the client making a second request per page of rentals.
      ownerName: users.name,
      ownerAvatarUrl: users.avatarUrl,
      ownerVerified: users.verified,
    })
    .from(rentals)
    .innerJoin(products, eq(rentals.productId, products.id))
    .innerJoin(orders, eq(rentals.orderId, orders.id))
    .leftJoin(orderItems, eq(rentals.orderItemId, orderItems.id))
    .innerJoin(users, eq(rentals.ownerId, users.id))
    .where(where)
    .orderBy(...buildRentalSort(filters.sort))
    .$dynamic();

  if (filters.page !== null) {
    query = query.limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize);
  }

  const rows = await query;
  const data = rows.map(decorateRental);

  if (filters.page === null) return c.json(ok(data));
  return c.json(ok(data, buildPagination(filters.page, filters.pageSize, Number(total))));
});

/* ------------------------------ detail (mine) ------------------------------ */

/**
 * One rental in full.
 *
 * Ownership is part of the lookup predicate, so another customer's rental is
 * indistinguishable from one that does not exist — a 403 would confirm the id is
 * real. Both parties to a rental (renter and owner) may read it, since the
 * seller surfaces legitimately need the same record.
 */
rentalsRoute.get("/:id", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  }

  await reconcileRentalStatuses(db, { renterId: user.id });
  await reconcileRentalStatuses(db, { ownerId: user.id });

  const [row] = await db
    .select({
      id: rentals.id,
      orderId: rentals.orderId,
      productId: rentals.productId,
      startDate: rentals.startDate,
      endDate: rentals.endDate,
      actualReturnDate: rentals.actualReturnDate,
      dailyRate: rentals.dailyRate,
      rentalSubtotal: rentals.rentalSubtotal,
      securityDeposit: rentals.securityDeposit,
      deliveryFee: rentals.deliveryFee,
      total: rentals.total,
      rentCreditApplied: rentals.rentCreditApplied,
      status: rentals.status,
      returnRequestedAt: rentals.returnRequestedAt,
      completedAt: rentals.completedAt,
      extensionRequestedAt: rentals.extensionRequestedAt,
      extensionRequestedDays: rentals.extensionRequestedDays,
      renterId: rentals.renterId,
      ownerId: rentals.ownerId,
      createdAt: rentals.createdAt,
      updatedAt: rentals.updatedAt,
      title: products.title,
      productSlug: products.slug,
      condition: products.condition,
      listingType: products.listingType,
      primaryImage: sql<string | null>`(
        SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id}
        ORDER BY pi.sort_order ASC LIMIT 1
      )`,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      paymentStatus: orders.paymentStatus,
      deliveryMethod: orders.deliveryMethod,
      deliveryAddressSnapshot: orders.deliveryAddressSnapshot,
      orderItemTitle: orderItems.titleSnapshot,
      orderItemImage: orderItems.imageSnapshot,
      orderItemMode: orderItems.mode,
      orderItemQuantity: orderItems.quantity,
      orderItemRentalDays: orderItems.rentalDays,
    })
    .from(rentals)
    .innerJoin(products, eq(rentals.productId, products.id))
    .innerJoin(orders, eq(rentals.orderId, orders.id))
    .leftJoin(orderItems, eq(rentals.orderItemId, orderItems.id))
    .where(and(eq(rentals.id, id), or(eq(rentals.renterId, user.id), eq(rentals.ownerId, user.id))))
    .limit(1);

  if (!row) throw new HttpError(404, "NOT_FOUND", "Rental not found.");

  const seller = row.ownerId === user.id ? null : await loadSellers([row.ownerId]);
  const rental = decorateRental(row);

  // The recorded steps, not the current status. This is what makes the timeline
  // a history rather than a restatement of where the rental is now.
  const events = await db
    .select({ type: rentalEvents.type, createdAt: rentalEvents.createdAt })
    .from(rentalEvents)
    .where(eq(rentalEvents.rentalId, id))
    .orderBy(asc(rentalEvents.createdAt));

  return c.json(
    ok({
      rental,
      seller: seller?.[0] ?? null,
      // One object carrying the method *and* the address snapshot, so the
      // delivery section has a single thing to render. The address is the
      // order's, not the customer's current profile one.
      delivery: {
        method: row.deliveryMethod,
        address: parseAddressSnapshot(row.deliveryAddressSnapshot),
      },
      timeline: buildRentalTimeline({
        events: events.map((e) => ({
          type: e.type,
          createdAt: e.createdAt.toISOString(),
        })),
        status: rental.status,
        confirmedAt: row.createdAt.toISOString(),
      }),
      eligibility: {
        canExtend: rental.status === "ACTIVE" || rental.status === "CONFIRMED",
        canRequestReturn: rental.status === "ACTIVE" || rental.status === "CONFIRMED",
        canCancel: rental.status === "CONFIRMED",
      },
    }),
  );
});

/* ------------------------- return initiation (renter) ---------------------- */

/**
 * Ask to hand the item back.
 *
 * Moves the rental to `RETURN_PENDING` and records *when*. It deliberately does
 * not mark it returned: the item has to physically come back, and only then does
 * the existing `POST /:id/return` close the rental out. No refund is issued or
 * implied here.
 */
rentalsRoute.post("/:id/return-request", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  // Ownership is part of the lookup, not a check afterwards. Loading by id
  // alone and answering 403 would confirm the rental exists to someone probing
  // ids — the same 404 a non-existent rental gets.
  const [rental] = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, id), eq(rentals.renterId, user.id)))
    .limit(1);
  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  // Only the renter initiates a return; the owner confirms it via `/:id/return`.
  if (rental.status === "RETURN_PENDING") {
    // Idempotent: asking twice is not an error, it is the same request.
    return c.json(ok({ status: rental.status, requestedAt: rental.returnRequestedAt }));
  }
  if (rental.status !== "ACTIVE" && rental.status !== "CONFIRMED") {
    throw new HttpError(
      409,
      "RETURN_NOT_ALLOWED",
      "This rental is not currently out, so there is nothing to return.",
    );
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(rentals)
      .set({ status: "RETURN_PENDING", returnRequestedAt: now, updatedAt: now })
      .where(eq(rentals.id, id));
    // The step is recorded in the same transaction as the status change, so the
    // history can never claim a return was requested when the status says
    // otherwise.
    await recordRentalEvent(tx, id, "RETURN_REQUESTED", { requestedAt: now.toISOString() });

    // The owner is the one who has to act on this — they confirm the return via
    // `POST /rentals/:id/return`, and the deposit release depends on them doing it.
    // The renter already knows they asked (they just did), so they are not told.
    if (rental.ownerId !== rental.renterId) {
      await notify(tx, {
        userId: rental.ownerId,
        type: "RENTAL_RETURN_REQUESTED",
        title: "Return requested",
        body: "The renter has asked to return an item. Confirm the return to release their deposit.",
        context: { rentalId: id, orderId: rental.orderId, orderNumber: null },
        eventKey: notificationEventKey("RENTAL_RETURN_REQUESTED", id, rental.ownerId),
        link: "/dashboard/rentals",
      });
    }
  });

  return c.json(ok({ status: "RETURN_PENDING" as const, requestedAt: now }));
});

/* --------------------------- extension request ----------------------------- */

/**
 * Strict: an unexpected key is an error, not something to ignore.
 *
 * This is the security boundary. A plain zod object *strips* unknown keys, so a
 * body carrying `additionalCost` or `newEndDate` would be quietly discarded and
 * the request would look accepted — which is the worst possible outcome for a
 * field a client is trying to dictate. Failing loudly is the point.
 */
const extensionRequestSchema = z
  .object({
    /** The only client-controlled value. Everything financial is server-derived. */
    additionalDays: z.number().int().min(1).max(180),
  })
  .strict();

/**
 * Request extra rental time.
 *
 * The server decides everything that matters: current status, the maximum rental
 * duration, conflicting future bookings, and the price of the extra days. The
 * client sends a number of days and nothing else — no end date, no total, no
 * deposit.
 *
 * The request is **recorded, not applied**. Applying it would extend the rental
 * without charging for the extra days, because no approval or settlement flow
 * exists yet (there is nowhere to take the money). So the end date is left
 * alone, `extensionRequestedAt` records the ask, and the response returns the
 * server-computed quote for the future approval step to honour. Claiming the
 * rental had been extended would be handing out free rental time.
 */
rentalsRoute.post("/:id/extension-request", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const input = extensionRequestSchema.parse(await c.req.json());

  // Ownership in the lookup, not as a check afterwards: a 403 would confirm the
  // rental exists to someone probing ids.
  const [rental] = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, id), eq(rentals.renterId, user.id)))
    .limit(1);
  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  if (rental.status !== "ACTIVE" && rental.status !== "CONFIRMED") {
    throw new HttpError(409, "EXTENSION_NOT_ALLOWED", "This rental can no longer be extended.");
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, rental.productId))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const currentDays = rentalDays({ startDate: rental.startDate, endDate: rental.endDate });
  const newDays = currentDays + input.additionalDays;

  // Maximum duration is a property of the listing, and the same rule the cart
  // and order creation enforce.
  if (product.maximumRentalDays && newDays > product.maximumRentalDays) {
    throw new HttpError(
      409,
      "EXTENSION_TOO_LONG",
      `This item can be rented for at most ${product.maximumRentalDays} days in total.`,
    );
  }

  const newEndDate = addRentalDays(rental.endDate, input.additionalDays);

  // The window being claimed must be free. `excludeRentalId` keeps the rental
  // being extended from blocking itself.
  try {
    await assertRentalAvailability(rental.productId, 1, rental.startDate, newEndDate, rental.id);
  } catch (error) {
    if (error instanceof HttpError) {
      throw new HttpError(
        409,
        "EXTENSION_UNAVAILABLE",
        "This rental can no longer be extended because another booking begins after your current rental period.",
      );
    }
    throw error;
  }

  // The extra days are priced at the effective rate for the *new* total length,
  // so a longer rental gets the week/month tier it now qualifies for — the same
  // rule the cart uses, and always cheaper for the customer, never dearer.
  const oldRate = effectiveDailyRate(product, currentDays);
  const newRate = effectiveDailyRate(product, newDays);
  const additionalCost = Math.max(0, newRate * newDays - oldRate * currentDays);

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(rentals)
      .set({
        extensionRequestedAt: now,
        extensionRequestedDays: input.additionalDays,
        updatedAt: now,
      })
      .where(eq(rentals.id, id));
  });

  return c.json(
    ok({
      requested: true,
      additionalDays: input.additionalDays,
      // Everything below is the server's arithmetic, returned for the approval
      // step to use. None of it was taken from the request.
      currentEndDate: rental.endDate,
      proposedEndDate: newEndDate,
      additionalCost,
      currency: "INR",
      status: rental.status,
      requestedAt: now,
    }),
  );
});

rentalsRoute.post("/:id/return", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  // Both parties to a rental may confirm a return, and both are in the
  // predicate — so a rental belonging to neither is a 404, not a 403 that would
  // confirm the id is real.
  const [rental] = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, id), or(eq(rentals.renterId, user.id), eq(rentals.ownerId, user.id))))
    .limit(1);
  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  // `RETURN_PENDING` is allowed so the lifecycle the customer starts in this
  // feature (a return request) can be completed here. Additive only — no
  // previously valid status was removed.
  if (!["ACTIVE", "CONFIRMED", "RETURN_PENDING"].includes(rental.status)) {
    throw new HttpError(400, "BAD_REQUEST", "This rental cannot be returned right now.");
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(rentals)
      .set({ status: "RETURNED", actualReturnDate: now, updatedAt: now })
      .where(eq(rentals.id, id));
    await recordRentalEvent(tx, id, "RETURNED", { returnedAt: now.toISOString() });

    // The item is back, so the rental has been earned. This is the *only* point at
    // which a rental earning is recorded — never at booking, because a booking is a
    // promise and crediting it means paying a seller for an item that never left the
    // shelf. Recorded `PENDING`: the deposit release and the settlement delay both
    // stand between this and the money being withdrawable.
    await recordRentalEarning(tx, id);

    // Both parties, because both have a reason to want to know: the renter is owed a
    // deposit release and the owner has their item back. Keyed on the rental, so a
    // double-submitted return confirms once.
    const context = { rentalId: id };
    await notify(tx, {
      userId: rental.renterId,
      type: "RENTAL_RETURNED",
      title: "Return confirmed",
      body: "Your rental has been returned. Your deposit release follows shortly.",
      context,
      eventKey: notificationEventKey("RENTAL_RETURNED", id, rental.renterId),
    });
    if (rental.ownerId !== rental.renterId) {
      await notify(tx, {
        userId: rental.ownerId,
        type: "RENTAL_RETURNED",
        title: "Your item has been returned",
        body: "A rental of your item has been returned.",
        context,
        eventKey: notificationEventKey("RENTAL_RETURNED", id, rental.ownerId),
        // Owner-side, so it opens the seller's rentals workspace.
        link: "/dashboard/rentals",
      });
    }
  });
  return c.json(ok({ returned: true }));
});

rentalsRoute.post("/:id/cancel", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  // Ownership in the predicate: a 403 would confirm the rental id is real.
  const [rental] = await db
    .select()
    .from(rentals)
    .where(and(eq(rentals.id, id), eq(rentals.renterId, user.id)))
    .limit(1);
  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  if (rental.status !== "CONFIRMED") {
    throw new HttpError(400, "BAD_REQUEST", "Only upcoming rentals can be cancelled.");
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(rentals).set({ status: "CANCELLED", updatedAt: now }).where(eq(rentals.id, id));
    await recordRentalEvent(tx, id, "CANCELLED", { cancelledAt: now.toISOString() });

    // Unwind the owner's earning for this booking. Only a `CONFIRMED` rental can be
    // cancelled, and a rental is only ever earned at return, so there is normally
    // nothing to unwind — the call finds nothing and returns. It is made anyway so
    // that the invariant "a cancelled rental leaves no credit behind" holds without
    // depending on the current cancellation rules continuing to be as strict.
    await recordEarningReversal(tx, { rentalId: id }, "Rental cancelled by the renter");

    await tx.insert(transactions).values({
      userId: rental.renterId,
      orderId: rental.orderId,
      type: "REFUND",
      amount: rental.total,
      status: "SUCCEEDED",
      provider: "mock",
      providerTransactionId: `refund_${Date.now()}`,
    });
    // Both parties: the renter paid and needs the refund confirmed, the owner needs to
    // know the booking is gone and the item is free again. Keyed on the rental so a
    // double-submitted cancellation speaks once.
    const context = { rentalId: id, orderId: rental.orderId, orderNumber: null };
    await notify(tx, {
      userId: rental.renterId,
      type: "RENTAL_CANCELLED",
      title: "Rental cancelled",
      body: "Your rental was cancelled and your refund has been issued.",
      context,
      eventKey: notificationEventKey("RENTAL_CANCELLED", id, rental.renterId),
    });
    await notify(tx, {
      userId: rental.renterId,
      type: "REFUND_PROCESSED",
      title: "Refund processed",
      body: "The refund for your cancelled rental is on its way to your original payment method.",
      context,
      // The refund transaction is written unconditionally above, so this must not
      // collapse into the RENTAL_CANCELLED key — the discriminator keeps them distinct.
      eventKey: notificationEventKey("RENTAL_CANCELLED", id, `refund:${rental.renterId}`),
    });
    if (rental.ownerId !== rental.renterId) {
      await notify(tx, {
        userId: rental.ownerId,
        type: "RENTAL_CANCELLED",
        title: "Rental cancelled",
        body: "A rental of your item was cancelled.",
        context,
        eventKey: notificationEventKey("RENTAL_CANCELLED", id, rental.ownerId),
        link: "/dashboard/rentals",
      });
    }
  });
  return c.json(ok({ cancelled: true }));
});

/* ------------------------------ buy-after-rent ----------------------------- */

rentalsRoute.post("/:id/buy", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const [rental] = await db.select().from(rentals).where(eq(rentals.id, id)).limit(1);
  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  if (rental.renterId !== user.id) {
    throw new HttpError(403, "FORBIDDEN", "Only the renter can use rent-to-own.");
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, rental.productId))
    .limit(1);
  if (!product || !product.rentToOwnEnabled || !product.purchasePrice) {
    throw new HttpError(400, "RENT_TO_OWN_UNAVAILABLE", "This item doesn't support rent-to-own.");
  }
  if (product.availableQuantity < 1) {
    throw new HttpError(409, "UNAVAILABLE", "This item is no longer available to buy.");
  }

  // Credit = eligible rental payments × configured % capped at configured cap
  const creditPercentage = product.rentCreditPercentage ?? 0;
  const creditCap = product.rentCreditCap ?? product.purchasePrice;
  const eligiblePayments = rental.rentalSubtotal;
  const credit = Math.min(
    Math.round((eligiblePayments * creditPercentage) / 100),
    creditCap,
    product.purchasePrice,
  );

  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        userId: user.id,
        orderType: "PURCHASE",
        status: "PAID",
        subtotal: product.purchasePrice!,
        deliveryFee: 0,
        depositTotal: 0,
        total: product.purchasePrice! - credit,
        deliveryMethod: "PICKUP",
        paymentProvider: "mock",
        paymentReference: `rto_${Date.now()}`,
      })
      .$returningId();
    const orderId = Number(order.id);

    await tx.insert(orderItems).values({
      orderId: orderId,
      productId: product.id,
      sellerId: product.sellerId,
      mode: "BUY",
      quantity: 1,
      unitPrice: product.purchasePrice!,
      lineTotal: product.purchasePrice!,
      titleSnapshot: product.title,
      rentCreditApplied: credit,
    });

    await tx.update(rentals).set({ rentCreditApplied: credit }).where(eq(rentals.id, id));

    // Goes through the shared stock helper rather than an inline decrement: this
    // path used to write `'SOLD'`, which is not a member of `PRODUCT_STATUSES`.
    // Since every public query opts rows *in* via `PUBLIC_PRODUCT_STATUSES`, a
    // listing bought down to its last unit silently vanished from Browse, from
    // the category pages and from search.
    await adjustProductInventory(tx, product.id, -1);

    await tx.insert(transactions).values({
      userId: user.id,
      orderId: orderId,
      type: "PAYMENT",
      amount: product.purchasePrice! - credit,
      status: "SUCCEEDED",
      provider: "mock",
      providerTransactionId: `rto_${Date.now()}`,
    });

    return { orderId, credit };
  });

  return c.json(ok({ orderId: result.orderId, credit: result.credit }), 201);
});
