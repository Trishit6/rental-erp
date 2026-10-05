import { Router } from "../lib/http";
import { z } from "zod";
import { ne, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  orders,
  orderItems,
  payouts,
  products,
  productImages,
  reports,
  rentals,
  reviews,
  users,
  categories,
  sellerProfiles,
} from "../schema";
import { ok, HttpError, buildPagination, paginationQuerySchema } from "../lib/api";
import { requireAdmin } from "../lib/auth";
import {
  adminProductsQuerySchema,
  listAdminProductFacets,
  listAdminProducts,
} from "../lib/admin-products";
import {
  BULK_PRODUCT_STATUSES,
  adminProductEditSchema,
  bulkSetAdminProductStatus,
  deleteAdminProduct,
  updateAdminProduct,
} from "../lib/admin-product-writer";
import { PRODUCT_STATUSES, PUBLIC_PRODUCT_STATUSES } from "../lib/product-status";
import { isPayoutStatus, listAllPayouts, setPayoutStatus } from "../lib/wallet";
import {
  adminOrdersQuerySchema,
  adminRentalsQuerySchema,
  adminUsersQuerySchema,
  adminSellersQuerySchema,
  adminTransactionsQuerySchema,
  adminReviewsQuerySchema,
  adminAuditQuerySchema,
  listAdminOrders,
  listAdminRentals,
  listAdminUsers,
  listAdminSellers,
  listAdminTransactions,
  listAdminReviews,
  listAdminAuditLog,
  getAdminFinanceSummary,
} from "../lib/admin-queries";
import { recordAudit } from "../lib/audit";
import { reconcileRentalStatuses } from "../lib/rental-lifecycle";
import { notificationEventKey } from "../lib/notification-events";
import { notify } from "../lib/notifications";

export const adminRoute = new Router();

adminRoute.use("*", async (c, next) => {
  requireAdmin(c);
  await next();
});

/* -------------------------------- dashboard -------------------------------- */

/**
 * `GET /api/admin/stats` — the overview cards.
 *
 * Every number is a live `COUNT`/`SUM` against MariaDB. Nothing here is a literal,
 * so the dashboard cannot quietly disagree with the marketplace it is reporting on.
 *
 * The eight aggregates run concurrently rather than in sequence: they touch four
 * tables with no interdependency, and the dashboard should cost one round trip's
 * latency instead of eight.
 *
 * "Revenue" deliberately counts orders that have *left* `PENDING_PAYMENT`, which
 * is the same boundary the existing `grossVolume` used. Counting unpaid baskets
 * would report revenue the marketplace has not received.
 */
adminRoute.get("/stats", async (c) => {
  const publicStatuses = [...PUBLIC_PRODUCT_STATUSES];

  const [
    [productCount],
    [activeProductCount],
    [userCount],
    [sellerCount],
    [orderCount],
    [activeRentalCount],
    [revenueRow],
    [pendingPayoutRow],
    [reviewCount],
    [openReports],
  ] = await Promise.all([
    db.select({ value: sql<number>`COUNT(*)` }).from(products),
    db
      .select({ value: sql<number>`COUNT(*)` })
      .from(products)
      .where(inArray(products.status, publicStatuses)),
    db.select({ value: sql<number>`COUNT(*)` }).from(users),
    db
      .select({ value: sql<number>`COUNT(*)` })
      .from(users)
      .where(sql`${users.role} IN ('SELLER','ADMIN')`),
    db.select({ value: sql<number>`COUNT(*)` }).from(orders),
    db
      .select({ value: sql<number>`COUNT(*)` })
      .from(rentals)
      .where(inArray(rentals.status, ["CONFIRMED", "ACTIVE", "RETURN_PENDING"])),
    db
      .select({ value: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
      .from(orders)
      .where(ne(orders.status, "PENDING_PAYMENT")),
    db
      .select({ value: sql<number>`COUNT(*)` })
      .from(payouts)
      .where(inArray(payouts.status, ["PENDING", "PROCESSING"])),
    db.select({ value: sql<number>`COUNT(*)` }).from(reviews),
    db
      .select({ value: sql<number>`COUNT(*)` })
      .from(reports)
      .where(eq(reports.status, "OPEN")),
  ]);

  return c.json(
    ok({
      totalProducts: Number(productCount.value),
      activeProducts: Number(activeProductCount.value),
      totalUsers: Number(userCount.value),
      totalSellers: Number(sellerCount.value),
      totalOrders: Number(orderCount.value),
      activeRentals: Number(activeRentalCount.value),
      totalRevenue: Number(revenueRow.value),
      pendingPayouts: Number(pendingPayoutRow.value),
      // Retained because the moderation sections still read them.
      reviews: Number(reviewCount.value),
      openReports: Number(openReports.value),
      grossVolume: Number(revenueRow.value),
    }),
  );
});

/* -------------------------------- products --------------------------------- */

/**
 * `GET /api/admin/products` — the catalogue, paged and filtered by the database.
 *
 * Replaces a handler that returned the 200 most recent rows regardless of what was
 * asked for. On a 20,000-row marketplace that was both wrong (no way to reach an
 * older listing) and heavy (the browser received a list it then could not narrow).
 * Search, every filter, sorting and paging are now resolved server-side; see
 * `lib/admin-products` for why the sort column is a whitelist.
 *
 * `pageSize` is capped at 60 by `paginationQuerySchema`, so no request can ask the
 * database for the whole table.
 */
adminRoute.get("/products", async (c) => {
  const query = adminProductsQuerySchema.parse(c.req.query());
  const { rows, total } = await listAdminProducts(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/**
 * `GET /api/admin/products/facets` — what the catalogue's dropdowns can offer.
 *
 * Declared before `/products/:id` so the literal path is not read as an id. The
 * digit constraint on that route makes the collision impossible either way, but
 * keeping the literal first costs nothing and reads more clearly.
 */
adminRoute.get("/products/facets", async (c) => {
  return c.json(ok(await listAdminProductFacets()));
});

adminRoute.patch("/products/:id/status", async (c) => {
  const id = Number(c.req.param("id"));
  const body = (await c.req.json()) as { status?: string };
  // The same vocabulary the seller uses, plus nothing. (`SOLD` was accepted here
  // and nowhere else, so a product set to it became uneditable and invisible —
  // a state nothing else in the app understood.)
  const allowed: readonly string[] = PRODUCT_STATUSES;
  if (!body.status || !allowed.includes(body.status)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid status.");
  }
  const [row] = await db
    .select({
      id: products.id,
      status: products.status,
      title: products.title,
      slug: products.slug,
      sellerId: products.sellerId,
    })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  if (row.status === body.status) {
    return c.json(ok({ updated: true, unchanged: true }));
  }
  await db.update(products).set({ status: body.status }).where(eq(products.id, id));
  await recordAudit(c, "PRODUCT_STATUS_SET", "product", id, `Status ${row.status} → ${body.status}.`);

  // Only the two moderation decisions that carry news for the seller are announced.
  // Every other status here (`PUBLISHED` → `PAUSED`, `SOLD`, an archive) either
  // concerns nobody or concerns the seller, who is the one performing it and is
  // already looking at the result. Keyed on the transition, so approving twice does
  // not send two notices — and the early return above already prevents that.
  if (body.status === "PUBLISHED" && row.status !== "PUBLISHED") {
    await notify(db, {
      userId: row.sellerId,
      type: "LISTING_APPROVED",
      title: "Listing approved",
      body: `“${row.title}” is approved and live.`,
      context: { productId: row.id, productSlug: row.slug },
      eventKey: notificationEventKey("LISTING_APPROVED", row.id),
    });
  } else if (row.status === "PENDING_APPROVAL" && body.status !== "PENDING_APPROVAL") {
    await notify(db, {
      userId: row.sellerId,
      type: "LISTING_REJECTED",
      title: "Listing not approved",
      body: `“${row.title}” was not approved. Open the listing to see what to change.`,
      context: { productId: row.id, productSlug: row.slug },
      eventKey: notificationEventKey("LISTING_REJECTED", row.id),
    });
  }

  return c.json(ok({ updated: true }));
});

/* ---------------------- catalogue write paths (edit/delete) ----------------- */

/**
 * `GET /api/admin/products/:id` — one listing, for the edit dialog.
 *
 * The list row deliberately carries eleven denormalised columns and *not* the
 * description, the optional price tiers or the deposit. This returns the whole
 * editable record in one request so opening the dialog is a fetch rather than a
 * form pre-filled from whatever the table happened to be showing.
 */
adminRoute.get("/products/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const [row] = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      description: products.description,
      status: products.status,
      condition: products.condition,
      listingType: products.listingType,
      categoryId: products.categoryId,
      brand: products.brand,
      location: products.location,
      sellerId: products.sellerId,
      sellerName: users.name,
      categoryName: categories.name,
      purchasePrice: products.purchasePrice,
      rentalPricePerDay: products.rentalPricePerDay,
      rentalPricePerWeek: products.rentalPricePerWeek,
      rentalPricePerMonth: products.rentalPricePerMonth,
      securityDeposit: products.securityDeposit,
      minimumRentalDays: products.minimumRentalDays,
      maximumRentalDays: products.maximumRentalDays,
      quantity: products.quantity,
      availableQuantity: products.availableQuantity,
      allowsDelivery: products.allowsDelivery,
      allowsPickup: products.allowsPickup,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(users, eq(products.sellerId, users.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  // Whether this listing can be removed outright, so the dialog can say *which*
  // of the two things will happen before the admin commits to it, rather than
  // surprising them with an archive after the fact.
  const [{ total }] = await db
    .select({ total: count() })
    .from(orderItems)
    .where(eq(orderItems.productId, id));

  return c.json(ok({ ...row, orderCount: Number(total) }));
});

/**
 * `PATCH /api/admin/products/:id` — an administrator corrects a listing.
 *
 * Field rules, the merge-then-validate order and the "not the seller's fields"
 * boundary all live in `lib/admin-product-writer.ts`; this handler is the HTTP
 * edge around them. Every accepted change is written to the audit log, because a
 * moderation edit that rewrites a seller's price is exactly the kind of action
 * that gets asked about later.
 */
adminRoute.patch("/products/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const input = adminProductEditSchema.parse(await c.req.json());
  const result = await updateAdminProduct(id, input);

  if (result.changed.length === 0) {
    return c.json(ok({ updated: false, unchanged: true, changed: [] }));
  }

  await recordAudit(
    c,
    "PRODUCT_EDITED",
    "product",
    id,
    `${result.changed.join(", ")} updated by admin.`,
  );
  return c.json(ok({ updated: true, changed: result.changed }));
});

/**
 * `DELETE /api/admin/products/:id` — remove, or archive when history forbids it.
 *
 * The archive-vs-delete decision belongs to the data layer (it is made by asking
 * about `order_items`), so this handler reports the outcome rather than choosing
 * it. `?force=1` refuses outright rather than archiving, for a caller that has
 * explicitly asked for a delete and must be told it cannot happen.
 */
adminRoute.delete("/products/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const force = c.req.query("force") === "1";
  const result = await deleteAdminProduct(id, { force });

  await recordAudit(
    c,
    result.outcome === "deleted" ? "PRODUCT_DELETED" : "PRODUCT_ARCHIVED",
    "product",
    id,
    result.outcome === "deleted"
      ? "Listing deleted (no order history)."
      : `Listing archived; ${result.orderCount} order line(s) reference it.`,
  );
  return c.json(ok(result));
});

const adminBulkStatusSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  status: z.enum(BULK_PRODUCT_STATUSES),
});

/**
 * `PATCH /api/admin/products/bulk-status` — one status, many listings.
 *
 * Capped at 200 ids because the row is a selection made from a page of at most 60,
 * and an unbounded `IN (…)` against a 20,000-row table is the shape that takes the
 * catalogue offline. Note this is deliberately *not* a bulk delete: archiving is
 * reversible and deletable history is not (§`order_items` RESTRICT).
 *
 * Declared before `/products/:id` in the file purely for readability; the digit
 * constraint on the id routes makes the collision impossible either way.
 */
adminRoute.patch("/products/bulk-status", async (c) => {
  const input = adminBulkStatusSchema.parse(await c.req.json());
  const result = await bulkSetAdminProductStatus(input.ids, input.status);

  await recordAudit(
    c,
    "PRODUCT_BULK_STATUS",
    "product",
    null,
    `${result.updated} listing(s) set to ${input.status}.`,
  );
  return c.json(ok(result));
});

/* --------------------------------- orders ----------------------------------- */

/**
 * `GET /api/admin/orders` — every order, paged and filtered server-side.
 *
 * Reuses the customer list's filter vocabulary (`order-queries`) plus two admin
 * axes: `customer` matches the buyer's name/email and `seller` narrows to orders
 * containing that seller's lines. Reuse is deliberate — an admin filter must mean
 * the same thing the customer's filter means, or support tickets write themselves.
 */
adminRoute.get("/orders", async (c) => {
  const query = adminOrdersQuerySchema.parse(c.req.query());
  const { rows, total } = await listAdminOrders(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/**
 * `GET /api/admin/orders/:id` — one order for administration.
 *
 * The full receipt: customer identity (an admin may need it for support), the
 * snapshot items, and the payment rows. Deliberately *not* the customer detail
 * shape — that one hides the email; this one is for the person answering the
 * support ticket.
 */
adminRoute.get("/orders/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(404, "NOT_FOUND", "Order not found.");
  }

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
      total: orders.total,
      currency: orders.currency,
      deliveryMethod: orders.deliveryMethod,
      deliveryAddressSnapshot: orders.deliveryAddressSnapshot,
      trackingNumber: orders.trackingNumber,
      paymentProvider: orders.paymentProvider,
      paymentReference: orders.paymentReference,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      customerName: users.name,
      customerEmail: users.email,
      customerPhone: users.phone,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, id))
    .limit(1);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found.");

  const items = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      sellerId: orderItems.sellerId,
      mode: orderItems.mode,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      lineTotal: orderItems.lineTotal,
      titleSnapshot: orderItems.titleSnapshot,
      imageSnapshot: orderItems.imageSnapshot,
      startDate: orderItems.startDate,
      endDate: orderItems.endDate,
      fulfillmentStatus: orderItems.fulfillmentStatus,
      sellerName: sql<string>`(SELECT u.name FROM users u WHERE u.id = ${orderItems.sellerId})`,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, id))
    .orderBy(asc(orderItems.id));

  return c.json(ok({ order, items }));
});

/**
 * `PATCH /api/admin/orders/:id/status` — advance an order's status.
 *
 * Admins move orders along the same lifecycle the fulfillment engine uses; there
 * is deliberately no free-form status string. Cancellation goes through the same
 * state machine the customer cancellation path uses (stock restoration, ledger
 * unwinding) and is therefore *not* re-implemented here — an admin who needs to
 * cancel asks the customer flow to do it, or uses the customer's own endpoint,
 * rather than a second cancellation implementation that skips the money logic.
 */
const adminOrderStatusSchema = z.object({
  status: z.enum([
    "PENDING_PAYMENT",
    "CONFIRMED",
    "PROCESSING",
    "READY_FOR_PICKUP",
    "SHIPPED",
    "DELIVERED",
    "COMPLETED",
  ]),
});

adminRoute.patch("/orders/:id/status", async (c) => {
  const id = Number(c.req.param("id"));
  const input = adminOrderStatusSchema.parse(await c.req.json().catch(() => ({})));

  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      orderNumber: orders.orderNumber,
      userId: orders.userId,
    })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found.");
  if (order.status === input.status) {
    return c.json(ok({ updated: true, unchanged: true }));
  }
  if (order.status === "CANCELLED") {
    throw new HttpError(409, "INVALID_TRANSITION", "A cancelled order cannot be reopened.");
  }

  await db
    .update(orders)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(orders.id, id));
  await recordAudit(
    c,
    "ORDER_STATUS_SET",
    "order",
    id,
    `Order ${order.orderNumber ?? id}: ${order.status} → ${input.status}.`,
  );

  // The customer is watching this order and cannot see the admin table, so every
  // status an admin sets here is news for them.
  //
  // Each status that means something has its *own* type. An earlier version folded
  // `READY_FOR_PICKUP` into `ORDER_PROCESSING` and `COMPLETED` into `ORDER_DELIVERED`
  // on the reasoning that one umbrella type per stage was tidier — but the copy for both
  // already existed below ("ready for collection", "is complete"), and the fold made the
  // notification actively wrong: a customer told their order was "being prepared" when it
  // was waiting to be collected, and one told their order had "been delivered" when it
  // had been delivered days earlier. It also left `ORDER_READY_FOR_PICKUP` and
  // `ORDER_COMPLETED` declared in the vocabulary with no emitter anywhere, which is the
  // exact drift `tests/notification-events.test.ts` now fails on.
  const announcedType = ORDER_STATUS_NOTIFICATION[input.status];
  if (announcedType) {
    await notify(db, {
      userId: order.userId,
      type: announcedType,
      title: `Order ${order.orderNumber ?? `#${id}`} is ${statusLabel(input.status).toLowerCase()}`,
      body: ORDER_STATUS_BODY[input.status].replace("{number}", order.orderNumber ?? `#${id}`),
      context: { orderId: id, orderNumber: order.orderNumber ?? null },
      eventKey: notificationEventKey(announcedType, id),
    });
  }

  return c.json(ok({ updated: true }));
});

/**
 * Which status change tells the customer something, and as what.
 *
 * Absent from the map means "nobody outside the admin workspace needs to hear about
 * it" — `PENDING_PAYMENT` and `CANCELLED` are absent because they are announced by the
 * payment and cancellation paths instead, which is where they actually originate.
 */
const ORDER_STATUS_NOTIFICATION: Partial<
  Record<(typeof adminOrderStatusSchema)["_output"]["status"], string>
> = {
  CONFIRMED: "ORDER_CONFIRMED",
  PROCESSING: "ORDER_PROCESSING",
  READY_FOR_PICKUP: "ORDER_READY_FOR_PICKUP",
  SHIPPED: "ORDER_SHIPPED",
  DELIVERED: "ORDER_DELIVERED",
  COMPLETED: "ORDER_COMPLETED",
};

const ORDER_STATUS_BODY: Record<string, string> = {
  CONFIRMED: "Your order {number} has been confirmed and is being prepared.",
  PROCESSING: "Your order {number} is being prepared.",
  READY_FOR_PICKUP: "Your order {number} is ready for collection.",
  SHIPPED: "Your order {number} has been shipped.",
  DELIVERED: "Your order {number} has been delivered.",
  COMPLETED: "Your order {number} is complete. Thanks for shopping with Revaro.",
};

/** Human-readable status for a notification title. */
function statusLabel(status: string): string {
  return status.replaceAll("_", " ").toLowerCase();
}

/* --------------------------------- rentals ---------------------------------- */

/**
 * `GET /api/admin/rentals` — every rental, with both parties named.
 *
 * Statuses are reconciled from dates before reading (the same
 * `reconcileRentalStatuses` the customer list runs), so the admin table cannot
 * show a rental as CONFIRMED whose window began yesterday.
 */
adminRoute.get("/rentals", async (c) => {
  const query = adminRentalsQuerySchema.parse(c.req.query());
  await reconcileRentalStatuses(db, {});
  const { rows, total } = await listAdminRentals(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/* ---------------------------------- users ----------------------------------- */

/**
 * `GET /api/admin/users` — accounts, paged, with per-user order/rental counts.
 *
 * The previous handler returned the 200 newest rows with no counts and no paging;
 * on a marketplace with thousands of accounts that is both unreachable past page
 * one and silent about who actually uses the platform.
 */
adminRoute.get("/users", async (c) => {
  const query = adminUsersQuerySchema.parse(c.req.query());
  const { rows, total } = await listAdminUsers(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

adminRoute.patch("/users/:id/suspend", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db
    .select({ id: users.id, role: users.role, name: users.name })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "User not found.");
  if (row.role !== "USER") {
    throw new HttpError(409, "INVALID_TRANSITION", "Only regular accounts can be suspended.");
  }

  await db.update(users).set({ role: "SUSPENDED" }).where(eq(users.id, id));
  await recordAudit(c, "USER_SUSPENDED", "user", id, `Suspended ${row.name} (#${id}).`);
  return c.json(ok({ suspended: true }));
});

adminRoute.patch("/users/:id/unsuspend", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db
    .select({ id: users.id, role: users.role, name: users.name })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "User not found.");
  if (row.role !== "SUSPENDED") {
    throw new HttpError(409, "INVALID_TRANSITION", "This account is not suspended.");
  }

  await db.update(users).set({ role: "USER" }).where(eq(users.id, id));
  await recordAudit(c, "USER_RESTORED", "user", id, `Restored ${row.name} (#${id}).`);
  return c.json(ok({ unsuspended: true }));
});

/* --------------------------------- sellers ---------------------------------- */

/**
 * `GET /api/admin/sellers` — sellers with their numbers.
 *
 * A seller is a user with a seller role (SELLER or ADMIN); the counts come from
 * correlated subqueries over the tables that know the truth (products, order
 * lines, rentals, the wallet ledger), so the row cannot disagree with the pages
 * the seller themselves sees.
 */
adminRoute.get("/sellers", async (c) => {
  const query = adminSellersQuerySchema.parse(c.req.query());
  const { rows, total } = await listAdminSellers(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/**
 * `PATCH /api/admin/sellers/:id/verified` — approve or revoke seller verification.
 *
 * Verification is the `sellerProfiles.verified` flag: the trust mark the product
 * page shows. Toggling it is an admin decision of record, so it is audited.
 */
adminRoute.patch("/sellers/:id/verified", async (c) => {
  const id = Number(c.req.param("id"));
  const input = z
    .object({ verified: z.boolean() })
    .strict()
    .parse(await c.req.json().catch(() => ({})));

  const [profile] = await db
    .select({ userId: sellerProfiles.userId })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, id))
    .limit(1);
  if (!profile) {
    throw new HttpError(404, "NOT_FOUND", "This account has no seller profile.");
  }

  await db
    .update(sellerProfiles)
    .set({ verified: input.verified, updatedAt: new Date() })
    .where(eq(sellerProfiles.userId, id));
  await recordAudit(
    c,
    input.verified ? "SELLER_APPROVED" : "SELLER_UNVERIFIED",
    "user",
    id,
    `Seller verification ${input.verified ? "granted" : "revoked"} for #${id}.`,
  );
  return c.json(ok({ verified: input.verified }));
});

/* --------------------------------- finance ---------------------------------- */

/**
 * `GET /api/admin/finance` — the platform's money story in one snapshot.
 *
 * Every figure is a live SUM over the ledger/orders/payouts. `sellerEarnings` and
 * `platformEarnings` come from the wallet ledger (what sellers were credited and
 * what the platform charged), while `grossRevenue` is what customers paid — the
 * three are related but never equal, and presenting them as one number would hide
 * the deposits and refunds that explain the difference.
 */
adminRoute.get("/finance", async (c) => {
  return c.json(ok(await getAdminFinanceSummary()));
});

/**
 * `GET /api/admin/transactions` — the payment ledger, searchable.
 *
 * Column-by-column selection: the table carries provider metadata and idempotency
 * keys that have no business in an admin table response, and selecting "the row"
 * would ship them.
 */
adminRoute.get("/transactions", async (c) => {
  const query = adminTransactionsQuerySchema.parse(c.req.query());
  const { rows, total } = await listAdminTransactions(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/* --------------------------------- reviews ---------------------------------- */

/**
 * `GET /api/admin/reviews` — the moderation queue for reviews.
 *
 * `scope=seller` narrows to reviews carrying a seller reply (see the helper in
 * `admin-queries` for why that is the honest reading of "seller reviews" given a
 * single review entity).
 */
adminRoute.get("/reviews", async (c) => {
  const query = adminReviewsQuerySchema.parse(c.req.query());
  const { rows, total } = await listAdminReviews(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/**
 * `PATCH /api/admin/reviews/:id/status` — hide or restore a review.
 *
 * The status vocabulary is the reviews table's own (PUBLISHED/HIDDEN/PENDING);
 * there is no admin-only "delete" because the customer's words are records, and
 * the moderation action the platform actually needs is *visibility*.
 */
adminRoute.patch("/reviews/:id/status", async (c) => {
  const id = Number(c.req.param("id"));
  const input = z
    .object({ status: z.enum(["PUBLISHED", "HIDDEN"]) })
    .strict()
    .parse(await c.req.json().catch(() => ({})));

  const [row] = await db
    .select({ id: reviews.id, status: reviews.status })
    .from(reviews)
    .where(eq(reviews.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Review not found.");
  if (row.status === input.status) return c.json(ok({ updated: true, unchanged: true }));

  await db.update(reviews).set({ status: input.status, updatedAt: new Date() }).where(eq(reviews.id, id));
  await recordAudit(
    c,
    input.status === "HIDDEN" ? "REVIEW_HIDDEN" : "REVIEW_RESTORED",
    "review",
    id,
    `Review #${id} ${input.status === "HIDDEN" ? "hidden" : "restored"}.`,
  );
  return c.json(ok({ status: input.status }));
});

/* -------------------------------- categories -------------------------------- */

/**
 * `GET /api/admin/categories` — the taxonomy with live counts.
 *
 * Mirrors the public categories payload plus `isActive` and both ids, so the
 * admin table can offer enable/disable without a second query per row.
 */
adminRoute.get("/categories", async (c) => {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      parentId: categories.parentId,
      isActive: categories.isActive,
      isFeatured: categories.isFeatured,
      sortOrder: categories.sortOrder,
      productCount: sql<number>`(SELECT COUNT(*) FROM products p WHERE p.category_id = ${categories.id})`,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return c.json(
    ok(
      rows.map((row) => ({
        ...row,
        productCount: Number(row.productCount ?? 0),
      })),
    ),
  );
});

/**
 * `PATCH /api/admin/categories/:id/active` — retire or restore a category.
 *
 * Deactivation, never deletion: products reference categories with an FK
 * `restrict`, and a deleted category would orphan them. An inactive category
 * stops appearing in discovery (public queries require active), which is what
 * "retired" means without breaking anything that points at it.
 */
adminRoute.patch("/categories/:id/active", async (c) => {
  const id = Number(c.req.param("id"));
  const input = z
    .object({ isActive: z.boolean() })
    .strict()
    .parse(await c.req.json().catch(() => ({})));

  const [row] = await db
    .select({ id: categories.id, isActive: categories.isActive, name: categories.name })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Category not found.");
  if (row.isActive === input.isActive) return c.json(ok({ updated: true, unchanged: true }));

  await db
    .update(categories)
    .set({ isActive: input.isActive, updatedAt: new Date() })
    .where(eq(categories.id, id));
  await recordAudit(
    c,
    input.isActive ? "CATEGORY_RESTORED" : "CATEGORY_RETIRED",
    "category",
    id,
    `Category "${row.name}" ${input.isActive ? "restored" : "retired"}.`,
  );
  return c.json(ok({ isActive: input.isActive }));
});

/* ------------------------------ product images ------------------------------ */

/**
 * `GET /api/admin/product-images` — listings with their image inventory.
 *
 * The admin's image page needs rows worth looking at: every product with its
 * image count, primary URL and whether any image URL points at a host the
 * storage layer no longer allows (the "broken image" source class).
 */
adminRoute.get("/product-images", async (c) => {
  const query = paginationQuerySchema.parse(c.req.query());

  const where = sql`1 = 1`;
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        sellerName: users.name,
        imageCount: sql<number>`(SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = ${products.id})`,
        primaryImage: sql<string | null>`(SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id} ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1)`,
      })
      .from(products)
      .innerJoin(users, eq(products.sellerId, users.id))
      .where(where)
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(products),
  ]);

  return c.json(
    ok(
      rows.map((row) => ({ ...row, imageCount: Number(row.imageCount ?? 0) })),
      buildPagination(query.page, query.pageSize, Number(totalRow.value)),
    ),
  );
});

/**
 * `GET /api/admin/product-images/:productId` — one listing's images, in order.
 */
adminRoute.get("/product-images/:id{[0-9]+}", async (c) => {
  const productId = Number(c.req.param("id"));

  const [product] = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const images = await db
    .select({
      id: productImages.id,
      url: productImages.url,
      altText: productImages.altText,
      sortOrder: productImages.sortOrder,
    })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder), asc(productImages.id));

  return c.json(ok({ product, images }));
});

/**
 * `POST /api/admin/product-images/:productId` — attach an image by URL.
 *
 * Admins attach by URL (the seeded catalogue's images are URLs) rather than by
 * file upload — the seller upload flow already owns multipart handling and the
 * storage provider, and duplicating it here would create a second way for bytes
 * to enter the system.
 */
adminRoute.post("/product-images/:id{[0-9]+}", async (c) => {
  const productId = Number(c.req.param("id"));
  const input = z
    .object({
      url: z.string().trim().url().max(500),
      altText: z.string().trim().max(200).optional(),
      makePrimary: z.boolean().optional(),
    })
    .strict()
    .parse(await c.req.json().catch(() => ({})));

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const [{ maxSort }] = await db
    .select({ maxSort: sql<number>`COALESCE(MAX(${productImages.sortOrder}), 0)` })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  const nextSort = input.makePrimary ? 0 : Number(maxSort ?? 0) + 1;
  if (input.makePrimary) {
    // Push every existing image down by one so the new row can take slot 0
    // without a unique constraint that does not exist — the ORDER BY in every
    // read (sort_order, id) makes slot 0 the primary.
    await db
      .update(productImages)
      .set({ sortOrder: sql`${productImages.sortOrder} + 1` })
      .where(eq(productImages.productId, productId));
  }

  const [inserted] = await db
    .insert(productImages)
    .values({
      productId,
      url: input.url,
      altText: input.altText ?? null,
      sortOrder: nextSort,
    })
    .$returningId();

  await recordAudit(
    c,
    "PRODUCT_IMAGE_ADDED",
    "image",
    Number(inserted?.id ?? 0),
    `Image attached to product #${productId}.`,
  );
  return c.json(ok({ added: true, imageId: Number(inserted?.id ?? 0) }));
});

/**
 * `DELETE /api/admin/product-images/:imageId` — remove one image.
 */
adminRoute.delete("/product-images/:id{[0-9]+}", async (c) => {
  const imageId = Number(c.req.param("id"));
  const [row] = await db
    .select({ id: productImages.id, productId: productImages.productId })
    .from(productImages)
    .where(eq(productImages.id, imageId))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Image not found.");

  await db.delete(productImages).where(eq(productImages.id, imageId));
  await recordAudit(c, "PRODUCT_IMAGE_REMOVED", "image", imageId, `Removed from product #${row.productId}.`);
  return c.json(ok({ removed: true }));
});

/**
 * `PATCH /api/admin/product-images/:imageId/primary` — set the primary image.
 *
 * "Primary" is `sort_order = 0` (every read orders by `sort_order, id`), so the
 * operation is: push everything else down one, put this one at 0, and collapse
 * the remaining gaps so the order stays dense.
 */
adminRoute.patch("/product-images/:id{[0-9]+}/primary", async (c) => {
  const imageId = Number(c.req.param("id"));
  const [row] = await db
    .select({ id: productImages.id, productId: productImages.productId, sortOrder: productImages.sortOrder })
    .from(productImages)
    .where(eq(productImages.id, imageId))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Image not found.");
  if (row.sortOrder === 0) return c.json(ok({ updated: true, unchanged: true }));

  await db.transaction(async (tx) => {
    const siblings = await tx
      .select({ id: productImages.id, sortOrder: productImages.sortOrder })
      .from(productImages)
      .where(eq(productImages.productId, row.productId))
      .orderBy(asc(productImages.sortOrder), asc(productImages.id));

    const others = siblings.filter((image) => image.id !== imageId);
    for (const [index, image] of others.entries()) {
      await tx
        .update(productImages)
        .set({ sortOrder: index + 1 })
        .where(eq(productImages.id, image.id));
    }
    await tx.update(productImages).set({ sortOrder: 0 }).where(eq(productImages.id, imageId));
  });

  await recordAudit(c, "PRODUCT_IMAGE_PRIMARY", "image", imageId, `Set as primary on product #${row.productId}.`);
  return c.json(ok({ updated: true }));
});

/* --------------------------------- audit log -------------------------------- */

/**
 * `GET /api/admin/audit-log` — what administrators did.
 *
 * Reading the log is itself an admin action, but is deliberately *not* audited:
 * every page view writing a row would double the table's size for no
 * accountability gain, and the read is behind the same requireAdmin gate as the
 * writes.
 */
adminRoute.get("/audit-log", async (c) => {
  const query = adminAuditQuerySchema.parse(c.req.query());
  const { rows, total } = await listAdminAuditLog(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/* --------------------------------- payouts --------------------------------- */

/**
 * `GET /api/admin/payouts` — the payout queue.
 *
 * The one surface where a seller id in the *query* is legitimate, because the
 * caller is an administrator and the whole point is to see other people's requests.
 * It is still a filter and never an authority: `setPayoutStatus` re-reads the row
 * and locks it, so nothing about this response can be used to steer a write.
 */
adminRoute.get("/payouts", async (c) => {
  const rawStatus = c.req.query("status");
  const rawLimit = Number(c.req.query("limit") ?? 100);
  const rows = await listAllPayouts({
    status: isPayoutStatus(rawStatus) ? rawStatus : null,
    limit: Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.trunc(rawLimit))) : 100,
  });
  return c.json(ok(rows));
});

/**
 * `PATCH /api/admin/payouts/:id/status` — process a payout request.
 *
 * ## The rule that makes this the only path
 *
 * A seller must never be able to answer their own request, and in a marketplace
 * the seller is precisely who an attacker would be. So there is no seller-facing
 * endpoint that changes a payout's status at all — not "cancel my own payout", not
 * "mark it paid". The request is created by the seller; only an administrator moves
 * it afterwards, and only along the transitions `PAYOUT_TRANSITIONS` allows.
 *
 * `COMPLETED` is reachable only from `PROCESSING`, so nobody can mark a payout paid
 * in one step without having picked it up. That is the difference between a record of
 * a transfer and a green tick that appeared.
 *
 * The audit fields (`reviewed_by`, `reviewed_at`) are written on every transition,
 * including a no-op attempt that the transition table refuses — so "who last looked
 * at this" is answerable from the row rather than from a log somebody has to keep.
 */
const payoutStatusSchema = z
  .object({
    status: z.string().trim().min(1).max(12),
    /** Required for a refusal, optional otherwise. Never instructions to staff. */
    reason: z.string().trim().max(255).optional(),
  })
  .strict();

adminRoute.patch("/payouts/:id{[0-9]+}/status", async (c) => {
  const admin = requireAdmin(c);
  const input = payoutStatusSchema.parse(await c.req.json().catch(() => ({})));

  if (!isPayoutStatus(input.status)) {
    throw new HttpError(400, "BAD_REQUEST", "That is not a payout state.");
  }
  if ((input.status === "FAILED" || input.status === "CANCELLED") && !input.reason?.trim()) {
    // A seller reads this sentence. "Failed" with nothing to act on is how a
    // marketplace gets a week of support tickets about a payout nobody will explain.
    throw new HttpError(
      400,
      "REASON_REQUIRED",
      "Give the seller a reason when you decline a payout.",
    );
  }

  return c.json(
    ok(
      await setPayoutStatus(Number(c.req.param("id")), input.status, {
        id: admin.id,
        reason: input.reason ?? null,
      }),
    ),
  );
});

/* --------------------------------- reports ---------------------------------- */

adminRoute.get("/reports", async (c) => {
  const rows = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(200);
  return c.json(ok(rows));
});

adminRoute.patch("/reports/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = (await c.req.json()) as { status?: string };
  const allowed = ["OPEN", "RESOLVED", "DISMISSED"];
  if (!body.status || !allowed.includes(body.status)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid status.");
  }
  await db.update(reports).set({ status: body.status }).where(eq(reports.id, id));
  return c.json(ok({ updated: true }));
});
