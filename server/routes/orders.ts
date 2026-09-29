import { Hono } from "hono";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  notifications,
  orderItems,
  orders,
  products,
  rentalEvents,
  rentals,
  transactions,
  users,
} from "../schema";
import { buildPagination, fail, ok, HttpError } from "../lib/api";
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
import {
  assertRentalAvailability,
  overlappingRentalCount,
} from "../lib/rental-availability";
import { effectiveDailyRate, rentalDays } from "../../src/lib/pricing";

export const ordersRoute = new Hono();
export const rentalsRoute = new Hono();

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

  return c.json(
    ok({
      order: { ...order, deliveryAddressSnapshot: parseAddressSnapshot(order.deliveryAddressSnapshot) },
      // `imageUrl` prefers the purchase-time snapshot and only falls back to the
      // product's current image. The internal columns are dropped so the client
      // has one field to render and cannot accidentally show the wrong one.
      items: items.map(({ imageSnapshot, liveImage, ...item }) => ({
        ...item,
        imageUrl: imageSnapshot ?? liveImage,
      })),
      rentals: rentalsForOrder,
      payment: payments[0] ?? null,
      payments,
      sellers,
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
    const orderSellers = [
      ...new Set(orderItemsForOrder.map((item) => item.sellerId)),
    ]
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
 * `delivery_address_snapshot` holds JSON written at purchase time.
 *
 * Parsed here rather than in the client so a malformed value degrades to "no
 * address shown" instead of throwing during render, and so the type crossing
 * the wire is a real object rather than an opaque string the UI has to guess
 * at.
 */
function parseAddressSnapshot(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Add the derived fields a rental UI needs, so the client never has to infer
 * state from dates.
 *
 * `bucket` and `depositStatus` in particular are decisions, not formatting: a
 * countdown that decided for itself whether a rental was active would let two
 * clients disagree with the server about what is happening.
 */
function decorateRental<T extends { status: string; startDate: Date; endDate: Date; securityDeposit: number }>(
  row: T,
) {
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
    .where(
      and(
        eq(rentals.id, id),
        or(eq(rentals.renterId, user.id), eq(rentals.ownerId, user.id)),
      ),
    )
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
    throw new HttpError(
      409,
      "EXTENSION_NOT_ALLOWED",
      "This rental can no longer be extended.",
    );
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
    await assertRentalAvailability(
      rental.productId,
      1,
      rental.startDate,
      newEndDate,
      rental.id,
    );
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
    await tx.insert(transactions).values({
      userId: rental.renterId,
      orderId: rental.orderId,
      type: "REFUND",
      amount: rental.total,
      status: "SUCCEEDED",
      provider: "mock",
      providerTransactionId: `refund_${Date.now()}`,
    });
    await tx.insert(notifications).values({
      userId: rental.ownerId,
      type: "RENTAL_CANCELLED",
      title: "Rental cancelled",
      body: `A rental of your item was cancelled.`,
      link: "/dashboard/rentals",
    });
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

    await tx
      .update(products)
      .set({
        availableQuantity: sql`${products.availableQuantity} - 1`,
        status: sql`CASE WHEN ${products.availableQuantity} - 1 <= 0 THEN 'SOLD' ELSE ${products.status} END`,
      })
      .where(eq(products.id, product.id));

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
