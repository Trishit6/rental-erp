import { Router, type Ctx } from "../lib/http";
import { z } from "zod";
import { and, ne, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
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
  roles,
  rolePermissions,
  userRoles,
  permissions,
} from "../schema";
import { ok, HttpError, buildPagination, paginationQuerySchema } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { requireAdmin, requireStepUp, requireUser, restoreUser, suspendUser } from "../lib/auth";
import {
  requireMfaEnrolment,
  requirePermission,
  resolveAccess,
  invalidateAccess,
  invalidateAllAccess,
  isLastActiveSuperAdmin,
} from "../lib/permissions";
import { recordSecurityEvent, requestIp, requestUserAgent } from "../lib/security-log";
import {
  adminProductsQuerySchema,
  listAdminProductFacets,
  listAdminProductRelations,
  listAdminProducts,
} from "../lib/admin-products";
import {
  BULK_PRODUCT_STATUSES,
  adminProductEditSchema,
  bulkCategorySchema,
  bulkDeleteAdminProducts,
  bulkMoveAdminProductCategory,
  bulkSetAdminProductStatus,
  deleteAdminProduct,
  updateAdminProduct,
} from "../lib/admin-product-writer";
import {
  categoryDeleteSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
  categoryWriteSchema,
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from "../lib/admin-categories";
import {
  BANNER_STATUSES,
  BLOCK_STATUSES,
  bannerInputSchema,
  bannerReorderSchema,
  bannerUpdateSchema,
  blockWriteSchema,
  createBanner,
  deleteBanner,
  deleteBlock,
  getAdminBlock,
  listAdminBanners,
  listAdminBlocks,
  listCmsVersions,
  reorderBanners,
  setBlockStatus,
  updateBanner,
  upsertBlock,
  blockCatalogue,
} from "../lib/cms";
import { PRODUCT_STATUSES, PUBLIC_PRODUCT_STATUSES } from "../lib/product-status";
import { ALL_ROLE_NAMES, BANNER_PLACEMENTS } from "../lib/enums";
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
import { recordAudit, withAudit } from "../lib/audit";
import { CUSTOMER_CANCELLABLE_FROM } from "../lib/order-cancellation";
import { reconcileRentalStatuses } from "../lib/rental-lifecycle";
import { notificationEventKey } from "../lib/notification-events";
import { notify } from "../lib/notifications";
import { notifyOrderProgress } from "../lib/order-notifications";
import {
  addAdminOrderNote,
  adminOrderNextStatuses,
  cancelAdminOrder,
  getAdminOrderDetail,
  overrideAdminOrderStatus,
  requestOrderRefund,
  setAdminOrderStatus,
} from "../lib/order-admin";
import {
  adminRentalNextStatuses,
  decideAdminRentalExtension,
  forceAdminRentalStatus,
  getAdminRentalDetail,
  hasActiveRentalOnOrder,
  isForcibleRentalStatus,
  settleAdminRentalDeposit,
} from "../lib/rental-admin";
import {
  adminDisputesQuerySchema,
  decideAdminDispute,
  getAdminDispute,
  listAdminDisputes,
} from "../lib/dispute-admin";
import { getOrderHealth } from "../lib/order-health";
import {
  addStaffMessage,
  getStaffTicket,
  listTicketsForStaff,
  TICKET_STATUSES,
  type TicketStatus,
} from "../lib/support";

export const adminRoute = new Router();

adminRoute.use("*", async (c, next) => {
  requireAdmin(c);
  // Staff areas are MFA-mandatory (PROMPT 3). The enrolment endpoints on the auth
  // router stay reachable so a blocked staff member can always turn MFA on.
  await requireMfaEnrolment()(c, next);
});

/* ---------------------------- route permissions ---------------------------- */

/**
 * The permission every admin route requires (PROMPT 22).
 *
 * ## Why this is middleware and not an `if` in each handler
 *
 * The brief is explicit: `requirePermission` on *every* `/api/admin` route, with
 * hidden buttons treated as UX only. A check written inside a handler is one
 * `return c.json(...)` away from being bypassed, and a check that lives at the
 * router cannot be reached by any request that skips a handler. Registering it
 * here means the gate runs *before* routing, so an under-permissioned staff
 * account learns nothing about the response it is being refused.
 *
 * ## Why method + prefix rather than one entry per route
 *
 * `Router.use` matches a path prefix, not a method, and several routes share a
 * path (`GET /products/:id` reads, `PATCH` moderates). Each entry carries the
 * method and the middleware passes a non-matching method straight through, so a
 * GET gate never applies to a PATCH and the two can carry different permissions
 * without wrapping every handler by hand.
 *
 * ## Why the coarse gate above still exists
 *
 * `requireAdmin` admits staff; these entries decide what each may *do*. A new
 * route with no entry here is caught by `tests/admin-permissions.test.ts`, which
 * asserts every registered route is covered — the one failure mode a
 * hand-maintained map otherwise has.
 */
export type AdminRoutePermission = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** A path prefix, matched the way the router's `use` matches. */
  path: string;
  permission: string;
};

export const ADMIN_ROUTE_PERMISSIONS: readonly AdminRoutePermission[] = [
  { method: "GET", path: "/stats", permission: "dashboard.view" },

  { method: "GET", path: "/products", permission: "products.view" },
  { method: "PATCH", path: "/products", permission: "products.moderate" },
  { method: "DELETE", path: "/products", permission: "products.moderate" },

  { method: "GET", path: "/orders", permission: "orders.view" },
  { method: "PATCH", path: "/orders", permission: "orders.manage" },
  { method: "POST", path: "/orders/:id/notes", permission: "orders.manage" },
  { method: "POST", path: "/orders/:id/refunds", permission: "orders.refund" },
  { method: "GET", path: "/order-health", permission: "orders.view" },

  { method: "GET", path: "/rentals", permission: "rentals.view" },
  { method: "PATCH", path: "/rentals", permission: "rentals.manage" },
  { method: "POST", path: "/rentals", permission: "rentals.manage" },

  { method: "GET", path: "/disputes", permission: "disputes.view" },
  { method: "PATCH", path: "/disputes", permission: "disputes.manage" },

  { method: "GET", path: "/users", permission: "users.view" },
  { method: "GET", path: "/users/:id{[0-9]+}/roles", permission: "rbac.manage" },
  { method: "PATCH", path: "/users", permission: "users.manage" },
  { method: "PUT", path: "/users", permission: "rbac.manage" },

  { method: "GET", path: "/sellers", permission: "vendors.view" },
  { method: "PATCH", path: "/sellers", permission: "vendors.manage" },

  { method: "GET", path: "/finance", permission: "payouts.view" },
  { method: "GET", path: "/transactions", permission: "payouts.view" },
  { method: "GET", path: "/payouts", permission: "payouts.view" },
  { method: "PATCH", path: "/payouts", permission: "payouts.approve" },

  { method: "GET", path: "/reviews", permission: "reviews.view" },
  { method: "PATCH", path: "/reviews", permission: "reviews.moderate" },

  { method: "GET", path: "/categories", permission: "categories.view" },
  { method: "PATCH", path: "/categories", permission: "categories.manage" },
  { method: "POST", path: "/categories", permission: "categories.manage" },
  { method: "DELETE", path: "/categories", permission: "categories.manage" },

  // CMS (PROMPT 26). One permission for the whole surface: whoever may edit content
  // may read and write it, and `content.manage` is held by CONTENT_MANAGER and every
  // administrator.
  { method: "GET", path: "/cms", permission: "content.manage" },
  { method: "POST", path: "/cms", permission: "content.manage" },
  { method: "PUT", path: "/cms", permission: "content.manage" },
  { method: "PATCH", path: "/cms", permission: "content.manage" },
  { method: "DELETE", path: "/cms", permission: "content.manage" },

  { method: "GET", path: "/product-images", permission: "products.view" },
  { method: "POST", path: "/product-images", permission: "products.moderate" },
  { method: "PATCH", path: "/product-images", permission: "products.moderate" },
  { method: "DELETE", path: "/product-images", permission: "products.moderate" },

  { method: "GET", path: "/reports", permission: "reports.view" },
  { method: "PATCH", path: "/reports", permission: "reports.resolve" },

  { method: "GET", path: "/support/tickets", permission: "support.view" },
  { method: "POST", path: "/support/tickets", permission: "support.reply" },

  { method: "GET", path: "/roles", permission: "rbac.manage" },
  { method: "POST", path: "/roles", permission: "rbac.manage" },
  { method: "PATCH", path: "/roles", permission: "rbac.manage" },
  { method: "DELETE", path: "/roles", permission: "rbac.manage" },
  { method: "GET", path: "/permissions", permission: "rbac.manage" },

  { method: "GET", path: "/audit-log", permission: "audit.view" },
];

for (const gate of ADMIN_ROUTE_PERMISSIONS) {
  adminRoute.use(gate.path, async (c, next) => {
    // A prefix matches every method under it; the gate only applies to its own.
    if (c.req.raw.method !== gate.method) {
      await next();
      return;
    }
    await requirePermission(gate.permission)(c, next);
  });
}

/**
 * `GET /api/admin/me` — the caller's own effective access.
 *
 * The sidebar filters to the modules a staff member's permissions allow, and the
 * role editor's "view as role" preview needs the same vocabulary the server
 * enforces. Neither can read the session's grants from `users.role` alone (staff
 * sub-roles live in `user_roles`), so this is the one admin read that is
 * deliberately not permission-gated: every staff member needs it to render their
 * own workspace, and it exposes nothing but their own grants.
 */
adminRoute.get("/me", async (c) => {
  const admin = requireAdmin(c);
  const access = await resolveAccess(admin.id);
  return c.json(
    ok({
      role: admin.role,
      roles: [...access.roles].sort(),
      permissions: [...access.permissions].sort(),
      isSuperAdmin: access.roles.has("SUPER_ADMIN"),
    }),
  );
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
  await recordAudit(c, {
    action: "PRODUCT_STATUS_SET",
    entityType: "product",
    entityId: id,
    details: `Status ${row.status} → ${body.status}.`,
    before: { status: row.status },
    after: { status: body.status },
  });

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

  await recordAudit(c, {
    action: "PRODUCT_EDITED",
    entityType: "product",
    entityId: id,
    details: `${result.changed.join(", ")} updated by admin.`,
    before: result.before,
    after: result.after,
  });
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

  await recordAudit(c, {
    action: result.outcome === "deleted" ? "PRODUCT_DELETED" : "PRODUCT_ARCHIVED",
    entityType: "product",
    entityId: id,
    details:
      result.outcome === "deleted"
        ? "Listing deleted (no order history)."
        : `Listing archived; ${result.orderCount} order line(s) reference it.`,
    after: { outcome: result.outcome },
  });
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

  await recordAudit(c, {
    action: "PRODUCT_BULK_STATUS",
    entityType: "product",
    entityId: null,
    details: `${result.updated} listing(s) set to ${input.status}.`,
    after: { status: input.status, updated: result.updated, requested: result.requested },
  });
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
/**
 * `GET /api/admin/orders/:id` — the full administrative view of one order.
 *
 * Assembled by `getAdminOrderDetail`: the receipt, the per-seller split, the
 * payment ledger, any rentals, refunds and disputes, and the order's timeline —
 * everything an operator needs to answer "what is going on with this order?"
 * without opening six other screens. `nextStatuses` and `canCancel` are computed
 * from the same state machine the actions enforce, so the buttons the UI offers
 * and the moves the API accepts cannot drift.
 */
adminRoute.get("/orders/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(404, "NOT_FOUND", "Order not found.");
  }

  const detail = await getAdminOrderDetail(id);
  if (!detail) throw new HttpError(404, "NOT_FOUND", "Order not found.");

  return c.json(
    ok({
      ...detail,
      nextStatuses: adminOrderNextStatuses(detail.order.status),
      canCancel: CUSTOMER_CANCELLABLE_FROM.has(detail.order.status),
    }),
  );
});

/**
 * `PATCH /api/admin/orders/:id/status` — advance an order along the shared ladder.
 *
 * The target must be a step `ADMIN_ORDER_TRANSITIONS` allows, so an admin move and
 * a customer or seller move mean the same thing. A jump the machine forbids is a
 * 409; `PATCH .../override` is the deliberate escape hatch and it demands a reason.
 * `CANCELLED` is absent here on purpose — it has its own route, because cancelling
 * carries money and rental consequences a plain status move does not.
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

/**
 * Load the fields the order actions need, or 404.
 *
 * `paymentStatus`, `total` and `currency` travel with the order because the state
 * machine, the cancellation guard and the refundable check each need one of them;
 * reading once keeps a single action's decisions consistent with a single snapshot.
 */
async function loadAdminOrder(id: number) {
  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      orderNumber: orders.orderNumber,
      userId: orders.userId,
      total: orders.total,
      currency: orders.currency,
    })
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found.");
  return order;
}

adminRoute.patch("/orders/:id/status", async (c) => {
  const admin = requireAdmin(c);
  const id = Number(c.req.param("id"));
  const input = adminOrderStatusSchema.parse(await c.req.json().catch(() => ({})));

  const order = await loadAdminOrder(id);
  if (order.status === input.status) {
    return c.json(ok({ updated: true, unchanged: true }));
  }

  await setAdminOrderStatus({ id: admin.id, role: "ADMIN" }, order, input.status);

  await recordAudit(c, {
    action: "ORDER_STATUS_SET",
    entityType: "order",
    entityId: id,
    details: `Order ${order.orderNumber ?? id}: ${order.status} → ${input.status}.`,
    before: { status: order.status },
    after: { status: input.status },
  });

  return c.json(ok({ updated: true }));
});

/** Any status the column may hold — what an override may target. */
const adminOrderOverrideSchema = z.object({
  status: z.enum([
    "PENDING_PAYMENT",
    "CONFIRMED",
    "PROCESSING",
    "READY_FOR_PICKUP",
    "SHIPPED",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
  ]),
  reason: z.string().trim().min(3).max(300),
});

/**
 * `PATCH /api/admin/orders/:id/override` — force any status, with a reason.
 *
 * The one order action that is not a state machine. `withAudit({ requireReason })`
 * makes the reason a request-level requirement (refused before the handler runs)
 * and records who wrote it; `overrideAdminOrderStatus` also writes it onto the
 * order timeline, because the customer's own view can read the timeline but not
 * the staff audit log.
 */
adminRoute.patch(
  "/orders/:id/override",
  withAudit({ action: "ORDER_OVERRIDE", entityType: "order", requireReason: true }, async (c, audit) => {
    const admin = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const input = adminOrderOverrideSchema.parse(await c.req.json().catch(() => ({})));
    const order = await loadAdminOrder(id);

    await overrideAdminOrderStatus(
      { id: admin.id, role: "ADMIN" },
      order,
      input.status,
      audit.reason ?? input.reason,
    );

    c.json(ok({ updated: true }));
    return {
      entityId: id,
      details: `Order ${order.orderNumber ?? id} forced ${order.status} → ${input.status}.`,
      before: { status: order.status },
      after: { status: input.status },
    };
  }),
);

/** `POST /api/admin/orders/:id/notes` — an internal note on the order timeline. */
const adminOrderNoteSchema = z.object({ note: z.string().trim().min(1).max(300) });

adminRoute.post("/orders/:id/notes", async (c) => {
  const admin = requireAdmin(c);
  const id = Number(c.req.param("id"));
  const input = adminOrderNoteSchema.parse(await c.req.json().catch(() => ({})));
  const order = await loadAdminOrder(id);

  await addAdminOrderNote({ id: admin.id, role: "ADMIN" }, order, input.note);

  await recordAudit(c, {
    action: "ORDER_NOTE_ADDED",
    entityType: "order",
    entityId: id,
    details: `Internal note on order ${order.orderNumber ?? id}.`,
  });

  return c.json(ok({ updated: true }));
});

/** `POST /api/admin/orders/:id/cancel` — cancel on the customer's behalf. */
const adminOrderCancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });

adminRoute.post("/orders/:id/cancel", async (c) => {
  const admin = requireAdmin(c);
  const id = Number(c.req.param("id"));
  const input = adminOrderCancelSchema.parse(await c.req.json().catch(() => ({})));
  const order = await loadAdminOrder(id);
  const hasActiveRental = await hasActiveRentalOnOrder(id);

  await cancelAdminOrder({ id: admin.id, role: "ADMIN" }, order, hasActiveRental, input.reason);

  await recordAudit(c, {
    action: "ORDER_CANCELLED",
    entityType: "order",
    entityId: id,
    details: `Order ${order.orderNumber ?? id} cancelled by admin.`,
    reason: input.reason,
    before: { status: order.status },
    after: { status: "CANCELLED" },
  });

  return c.json(ok({ cancelled: true }));
});

/** `POST /api/admin/orders/:id/refunds` — open a (PENDING) refund request. */
const adminOrderRefundSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
  orderItemId: z.number().int().positive().nullish(),
  idempotencyKey: z.string().trim().max(120).nullish(),
});

adminRoute.post(
  "/orders/:id/refunds",
  withAudit(
    { action: "ORDER_REFUND_REQUESTED", entityType: "order", requireReason: true },
    async (c, audit) => {
      const admin = requireAdmin(c);
      const id = Number(c.req.param("id"));
      const input = adminOrderRefundSchema.parse(await c.req.json().catch(() => ({})));
      const order = await loadAdminOrder(id);

      const refund = await requestOrderRefund({ id: admin.id, role: "ADMIN" }, order, {
        amount: input.amount,
        reason: input.reason,
        orderItemId: input.orderItemId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      });

      c.json(ok(refund));
      return {
        entityId: id,
        details: `Refund ${refund.refundNumber} requested for order ${order.orderNumber ?? id} (${refund.amount} paise).`,
        reason: audit.reason ?? input.reason,
        after: { refundNumber: refund.refundNumber, amount: refund.amount },
      };
    },
  ),
);

/**
 * `GET /api/admin/order-health` — stuck orders and overdue returns.
 *
 * On its own path rather than under `/orders` so it can never be swallowed by the
 * `/orders/:id` route — a mistake that would make the dashboard try to load an
 * order whose id is the word "health".
 */
adminRoute.get("/order-health", async (c) => {
  const health = await getOrderHealth();
  return c.json(ok(health));
});


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

/**
 * Load the fields a rental action needs, or 404.
 *
 * A superset of what each action consumes (the status machine needs the parties,
 * the deposit path needs the order line, the extension path needs the dates) so
 * one read serves all of them and a concurrent edit cannot be observed halfway.
 */
async function loadAdminRental(id: number) {
  const [rental] = await db
    .select({
      id: rentals.id,
      status: rentals.status,
      renterId: rentals.renterId,
      ownerId: rentals.ownerId,
      productId: rentals.productId,
      orderId: rentals.orderId,
      orderItemId: rentals.orderItemId,
      securityDeposit: rentals.securityDeposit,
      endDate: rentals.endDate,
      dailyRate: rentals.dailyRate,
      extensionRequestedDays: rentals.extensionRequestedDays,
      currency: orders.currency,
    })
    .from(rentals)
    .innerJoin(orders, eq(rentals.orderId, orders.id))
    .where(eq(rentals.id, id))
    .limit(1);
  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  return rental;
}

/**
 * `GET /api/admin/rentals/:id` — one rental in full.
 *
 * Reconciles derived state first (a `CONFIRMED` booking whose window has opened is
 * `ACTIVE`), then returns the parties, the product, the recorded steps and the
 * deposit position, plus `nextStatuses` from the same map the force action uses.
 */
adminRoute.get("/rentals/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  await reconcileRentalStatuses(db, {});
  const detail = await getAdminRentalDetail(id);
  if (!detail) throw new HttpError(404, "NOT_FOUND", "Rental not found.");
  return c.json(ok({ ...detail, nextStatuses: adminRentalNextStatuses(detail.rental.status) }));
});

const rentalForceSchema = z.object({ status: z.string().trim() });

/** `PATCH /api/admin/rentals/:id/status` — force a reachable rental status. */
adminRoute.patch(
  "/rentals/:id/status",
  withAudit({ action: "RENTAL_STATUS_FORCED", entityType: "rental" }, async (c) => {
    const admin = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const input = rentalForceSchema.parse(await c.req.json().catch(() => ({})));
    if (!isForcibleRentalStatus(input.status)) {
      throw new HttpError(400, "BAD_STATUS", "Unknown rental status.");
    }
    const rental = await loadAdminRental(id);
    await forceAdminRentalStatus({ id: admin.id, role: "ADMIN" }, rental, input.status);
    c.json(ok({ updated: true }));
    return {
      entityId: id,
      details: `Rental ${id}: ${rental.status} → ${input.status}.`,
      before: { status: rental.status },
      after: { status: input.status },
    };
  }),
);

/** `POST /api/admin/rentals/:id/return` — confirm a physical return. */
adminRoute.post(
  "/rentals/:id/return",
  withAudit({ action: "RENTAL_RETURN_CONFIRMED", entityType: "rental" }, async (c) => {
    const admin = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const rental = await loadAdminRental(id);
    await forceAdminRentalStatus({ id: admin.id, role: "ADMIN" }, rental, "RETURNED");
    c.json(ok({ updated: true }));
    return {
      entityId: id,
      details: `Rental ${id} marked returned by admin.`,
      before: { status: rental.status },
      after: { status: "RETURNED" },
    };
  }),
);

const rentalDepositSchema = z.object({
  deduction: z.number().int().nonnegative().default(0),
  reason: z.string().trim().min(3).max(300),
});

/** `POST /api/admin/rentals/:id/deposit` — release or deduct a security deposit. */
adminRoute.post(
  "/rentals/:id/deposit",
  withAudit(
    { action: "RENTAL_DEPOSIT_SETTLED", entityType: "rental", requireReason: true },
    async (c, audit) => {
      const admin = requireAdmin(c);
      const id = Number(c.req.param("id"));
      const input = rentalDepositSchema.parse(await c.req.json().catch(() => ({})));
      const rental = await loadAdminRental(id);
      const reason = audit.reason ?? input.reason;
      const result = await settleAdminRentalDeposit({ id: admin.id, role: "ADMIN" }, rental, {
        deduction: input.deduction,
        reason,
      });
      c.json(ok(result));
      return {
        entityId: id,
        details: `Rental ${id} deposit settled: released ${result.released}, deducted ${result.deduction}.`,
        reason,
        before: { deposit: rental.securityDeposit },
        after: { released: result.released, deduction: result.deduction, refundNumber: result.refundNumber },
      };
    },
  ),
);

const rentalExtensionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  days: z.number().int().min(1).max(365).optional(),
  reason: z.string().trim().min(3).max(300),
});

/** `POST /api/admin/rentals/:id/extension` — decide a pending extension request. */
adminRoute.post(
  "/rentals/:id/extension",
  withAudit(
    { action: "RENTAL_EXTENSION_DECIDED", entityType: "rental", requireReason: true },
    async (c, audit) => {
      const admin = requireAdmin(c);
      const id = Number(c.req.param("id"));
      const input = rentalExtensionSchema.parse(await c.req.json().catch(() => ({})));
      const rental = await loadAdminRental(id);
      const reason = audit.reason ?? input.reason;
      const result = await decideAdminRentalExtension(
        { id: admin.id, role: "ADMIN" },
        rental,
        input.decision,
        { days: input.days, reason },
      );
      c.json(ok(result));
      return {
        entityId: id,
        details: `Rental ${id} extension ${input.decision.toLowerCase()}d.`,
        reason,
        after: { days: result.days, newEndDate: result.newEndDate?.toISOString() ?? null },
      };
    },
  ),
);

/* -------------------------------- disputes ---------------------------------- */

/**
 * `GET /api/admin/disputes` — the queue. Filtered by status and date, and
 * searchable by dispute or order number.
 */
adminRoute.get("/disputes", async (c) => {
  const query = adminDisputesQuerySchema.parse(c.req.query());
  const { rows, total } = await listAdminDisputes(query);
  return c.json(ok(rows, buildPagination(query.page, query.pageSize, total)));
});

/** `GET /api/admin/disputes/:id` — one dispute with its order context. */
adminRoute.get("/disputes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, "NOT_FOUND", "Dispute not found.");
  const detail = await getAdminDispute(id);
  if (!detail) throw new HttpError(404, "NOT_FOUND", "Dispute not found.");
  return c.json(ok(detail));
});

const disputeDecisionSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "DISMISSED"]),
  resolution: z.string().trim().max(2000).default(""),
  refund: z
    .object({
      amount: z.number().int().positive(),
      reason: z.string().trim().min(3).max(300),
      idempotencyKey: z.string().trim().max(120).nullish(),
    })
    .nullish(),
});

/**
 * `PATCH /api/admin/disputes/:id` — decide a dispute.
 *
 * A terminal decision names the resolver and notifies both parties; an optional
 * refund is opened first, so the dispute only reaches its final state when the
 * refund request itself was valid.
 */
adminRoute.patch(
  "/disputes/:id",
  withAudit({ action: "DISPUTE_DECIDED", entityType: "dispute" }, async (c) => {
    const admin = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const input = disputeDecisionSchema.parse(await c.req.json().catch(() => ({})));

    const [dispute] = await db
      .select({
        id: disputes.id,
        disputeNumber: disputes.disputeNumber,
        status: disputes.status,
        orderId: disputes.orderId,
        openedBy: disputes.openedBy,
        againstUserId: disputes.againstUserId,
        orderNumber: orders.orderNumber,
      })
      .from(disputes)
      .innerJoin(orders, eq(disputes.orderId, orders.id))
      .where(eq(disputes.id, id))
      .limit(1);
    if (!dispute) throw new HttpError(404, "NOT_FOUND", "Dispute not found.");

    const result = await decideAdminDispute({ id: admin.id, role: "ADMIN" }, dispute, {
      status: input.status,
      resolution: input.resolution,
      refund: input.refund ?? null,
    });

    c.json(ok(result));
    return {
      entityId: id,
      details: `Dispute ${dispute.disputeNumber}: ${dispute.status} → ${input.status}.`,
      reason: input.resolution || null,
      before: { status: dispute.status },
      after: { status: input.status },
    };
  }),
);

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

/**
 * Suspension has exactly one route: `PATCH /users/:id/status` (below, in the RBAC
 * section). The old `/suspend` and `/unsuspend` handlers wrote `users.role`, which
 * the auth gate no longer reads — it reads `users.status` — so they were another
 * source of truth that silently stopped suspending anyone.
 */

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
  await recordAudit(c, {
    action: input.verified ? "SELLER_APPROVED" : "SELLER_UNVERIFIED",
    entityType: "user",
    entityId: id,
    details: `Seller verification ${input.verified ? "granted" : "revoked"} for #${id}.`,
    before: { verified: false },
    after: { verified: input.verified },
  });
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

  await db
    .update(reviews)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(reviews.id, id));
  await recordAudit(c, {
    action: input.status === "HIDDEN" ? "REVIEW_HIDDEN" : "REVIEW_RESTORED",
    entityType: "review",
    entityId: id,
    details: `Review #${id} ${input.status === "HIDDEN" ? "hidden" : "restored"}.`,
    before: { status: row.status },
    after: { status: input.status },
  });
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
  await recordAudit(c, {
    action: input.isActive ? "CATEGORY_RESTORED" : "CATEGORY_RETIRED",
    entityType: "category",
    entityId: id,
    details: `Category "${row.name}" ${input.isActive ? "restored" : "retired"}.`,
    before: { isActive: row.isActive },
    after: { isActive: input.isActive },
  });
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
        primaryImage: sql<
          string | null
        >`(SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id} ORDER BY pi.sort_order ASC, pi.id ASC LIMIT 1)`,
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

  await recordAudit(c, {
    action: "PRODUCT_IMAGE_ADDED",
    entityType: "image",
    entityId: Number(inserted?.id ?? 0),
    details: `Image attached to product #${productId}.`,
    after: { productId, url: input.url },
  });
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
  await recordAudit(c, {
    action: "PRODUCT_IMAGE_REMOVED",
    entityType: "image",
    entityId: imageId,
    details: `Removed from product #${row.productId}.`,
    before: { productId: row.productId },
  });
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
    .select({
      id: productImages.id,
      productId: productImages.productId,
      sortOrder: productImages.sortOrder,
    })
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

  await recordAudit(c, {
    action: "PRODUCT_IMAGE_PRIMARY",
    entityType: "image",
    entityId: imageId,
    details: `Set as primary on product #${row.productId}.`,
    before: { sortOrder: row.sortOrder },
    after: { sortOrder: 0 },
  });
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

adminRoute.patch(
  "/payouts/:id{[0-9]+}/status",
  withAudit({ action: "PAYOUT_STATUS_SET", entityType: "payout" }, async (c) => {
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

    const updated = await setPayoutStatus(Number(c.req.param("id")), input.status, {
      id: admin.id,
      reason: input.reason ?? null,
    });
    c.json(ok(updated));
    return {
      entityId: Number(c.req.param("id")),
      details: `Payout set to ${input.status}${input.reason?.trim() ? `: ${input.reason.trim()}` : ""}.`,
      reason: input.reason ?? null,
      after: { status: input.status },
    };
  }),
);

/* --------------------------------- reports ---------------------------------- */

adminRoute.get("/reports", async (c) => {
  const rows = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(200);
  return c.json(ok(rows));
});

adminRoute.patch("/reports/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = (await c.req.json()) as { status?: string };
  const allowed = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"];
  if (!body.status || !allowed.includes(body.status)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid status.");
  }
  const [existing] = await db
    .select({ status: reports.status })
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Report not found.");
  await db.update(reports).set({ status: body.status }).where(eq(reports.id, id));
  await recordAudit(c, {
    action: "REPORT_STATUS_SET",
    entityType: "report",
    entityId: id,
    details: `Report #${id} → ${body.status}.`,
    before: { status: existing.status },
    after: { status: body.status },
  });
  return c.json(ok({ updated: true }));
});

/* --------------------------------- support ---------------------------------- */

/**
 * The staff side of support (PROMPT 19).
 *
 * These sit under `/api/admin` so they inherit the MFA-mandatory admin gate declared at
 * the top of this file. The customer-facing reads filter internal notes out in SQL; these
 * are the reads that intentionally include them.
 */
adminRoute.get("/support/tickets", async (c) => {
  const { page, pageSize } = paginationQuerySchema.parse(c.req.query());
  const raw = c.req.query("status");
  const status =
    raw && (TICKET_STATUSES as readonly string[]).includes(raw) ? (raw as TicketStatus) : undefined;
  const { rows, pagination } = await listTicketsForStaff({ page, pageSize, status });
  return c.json(ok(rows, pagination));
});

adminRoute.get("/support/tickets/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(404, "NOT_FOUND", "That ticket does not exist.");
  }
  return c.json(ok(await getStaffTicket(id)));
});

const staffTicketReplySchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
    /** An internal note is written to the thread but filtered from every customer read. */
    isInternal: z.boolean().default(false),
  })
  .strict();

adminRoute.post(
  "/support/tickets/:id/messages",
  guarded("admin.action", async (c) => {
    const admin = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const input = staffTicketReplySchema.parse(await c.req.json());
    const result = await addStaffMessage(admin.id, id, input);
    await recordAudit(c, {
      action: "SUPPORT_REPLIED",
      entityType: "ticket",
      entityId: id,
      details: `Staff reply${input.isInternal ? " (internal note)" : ""}.`,
    });
    return c.json(ok(result), 201);
  }),
);

/* ----------------------------------- RBAC ----------------------------------- */

/**
 * `GET /api/admin/roles` — every role and the permission keys it carries.
 *
 * The permission resolution (`lib/permissions.ts`) reads exactly these joins at
 * runtime, so this listing is also a dry run of the shape an auth decision sees.
 */
adminRoute.get("/roles", async (c) => {
  const roleRows = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
    })
    .from(roles)
    .orderBy(asc(roles.name));
  const grantRows = await db
    .select({ roleId: rolePermissions.roleId, key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));
  const memberRows = await db
    .select({ roleId: userRoles.roleId, value: count() })
    .from(userRoles)
    .groupBy(userRoles.roleId);
  const keysByRole = new Map<number, string[]>();
  for (const row of grantRows) {
    const keys = keysByRole.get(row.roleId) ?? [];
    keys.push(row.key);
    keysByRole.set(row.roleId, keys);
  }
  const membersByRole = new Map(memberRows.map((row) => [row.roleId, Number(row.value)] as const));
  return c.json(
    ok(
      roleRows.map((role) => ({
        ...role,
        permissions: (keysByRole.get(role.id) ?? []).sort(),
        memberCount: membersByRole.get(role.id) ?? 0,
      })),
    ),
  );
});

/** `GET /api/admin/permissions` — the full permission vocabulary, grouped. */
adminRoute.get("/permissions", async (c) => {
  const rows = await db
    .select({
      key: permissions.key,
      description: permissions.description,
      groupKey: permissions.groupKey,
    })
    .from(permissions)
    .orderBy(asc(permissions.groupKey), asc(permissions.key));
  return c.json(ok(rows));
});

/* ------------------- role editor: custom roles (PROMPT 22) ------------------ */

/**
 * The permission keys the caller themselves holds, which cap what they may grant.
 *
 * `SUPER_ADMIN` is unrestricted. Every other manager may only hand out what they
 * already hold: without this, anyone who can open the editor could grant a role
 * `rbac.manage` (or `users.manage`) and then assign it to themselves — a privilege
 * escalation that would make the permission check decorative.
 */
async function assertGrantableKeys(c: Ctx, requested: string[]): Promise<void> {
  const user = requireUser(c);
  const access = await resolveAccess(user.id);
  if (access.roles.has("SUPER_ADMIN")) return;
  const unheld = requested.filter((key) => !access.permissions.has(key));
  if (unheld.length > 0) {
    throw new HttpError(
      403,
      "PERMISSION_ESCALATION",
      `You cannot grant permissions you do not hold: ${unheld.join(", ")}.`,
    );
  }
}

/** Resolve catalogue keys to their rows, refusing any key that is not a permission. */
async function permissionRowsFor(keys: string[]): Promise<{ id: number; key: string }[]> {
  if (keys.length === 0) return [];
  const rows = await db
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions)
    .where(inArray(permissions.key, keys));
  if (rows.length !== keys.length) {
    const known = new Set(rows.map((row) => row.key));
    const unknown = keys.filter((key) => !known.has(key));
    throw new HttpError(400, "BAD_REQUEST", `Unknown permission(s): ${unknown.join(", ")}.`);
  }
  return rows;
}

const roleNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Use letters, digits and underscores only.");

const roleWriteSchema = z
  .object({
    name: roleNameSchema,
    description: z.string().trim().max(200).optional(),
    permissions: z.array(z.string().trim().min(1).max(64)).max(64).default([]),
    /** Recorded in the audit log; mandatory, validated by `withAudit`. */
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

const roleUpdateSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: z.string().trim().max(200).nullable().optional(),
    permissions: z.array(z.string().trim().min(1).max(64)).max(64).optional(),
    /** Recorded in the audit log; mandatory, validated by `withAudit`. */
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

/**
 * `POST /api/admin/roles` — create a custom role.
 *
 * Built-in role names are reserved (`ALL_ROLE_NAMES`) so a custom role cannot be
 * named `ADMIN` and quietly take on the meaning the code already gives that word.
 */
adminRoute.post(
  "/roles",
  guarded(
    "admin.action",
    withAudit(
      { action: "RBAC_ROLE_CREATED", entityType: "role", requireReason: true },
      async (c) => {
        await requireStepUp(c);
        await requirePermission("rbac.manage")(c, async () => undefined);
        const input = roleWriteSchema.parse(await c.req.json().catch(() => ({})));

        const name = input.name.toUpperCase();
        if ((ALL_ROLE_NAMES as readonly string[]).includes(name)) {
          throw new HttpError(409, "ROLE_RESERVED", `"${name}" is a built-in role name.`);
        }
        const [duplicate] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, name))
          .limit(1);
        if (duplicate) {
          throw new HttpError(409, "ROLE_EXISTS", "A role with that name already exists.");
        }

        const keys = [...new Set(input.permissions)].sort();
        await assertGrantableKeys(c, keys);
        const permissionRows = await permissionRowsFor(keys);

        const [inserted] = await db
          .insert(roles)
          .values({ name, description: input.description ?? null, isSystem: false })
          .$returningId();
        const roleId = Number(inserted.id);
        if (permissionRows.length > 0) {
          await db
            .insert(rolePermissions)
            .values(permissionRows.map((row) => ({ roleId, permissionId: row.id })));
        }
        invalidateAllAccess();

        c.json(
          ok({
            id: roleId,
            name,
            description: input.description ?? null,
            isSystem: false,
            permissions: keys,
            memberCount: 0,
          }),
          201,
        );
        return {
          entityId: roleId,
          details: `Created role ${name} with ${keys.length} permission(s).`,
          after: { name, permissions: keys },
        };
      },
    ),
  ),
);

/**
 * `PATCH /api/admin/roles/:id` — rename, re-describe or re-grant a custom role.
 *
 * Built-in roles are immutable: the seed is their source of truth and editing them
 * here would be silently reverted on the next sync. A manager cannot edit a role
 * they themselves hold — that is how someone grants themselves more without a
 * second pair of eyes.
 */
adminRoute.patch(
  "/roles/:id{[0-9]+}",
  guarded(
    "admin.action",
    withAudit(
      { action: "RBAC_ROLE_UPDATED", entityType: "role", requireReason: true },
      async (c) => {
        const admin = await requireStepUp(c);
        await requirePermission("rbac.manage")(c, async () => undefined);
        const roleId = Number(c.req.param("id"));
        const input = roleUpdateSchema.parse(await c.req.json().catch(() => ({})));

        const [role] = await db
          .select({ id: roles.id, name: roles.name, isSystem: roles.isSystem })
          .from(roles)
          .where(eq(roles.id, roleId))
          .limit(1);
        if (!role) throw new HttpError(404, "NOT_FOUND", "Role not found.");
        if (role.isSystem) {
          throw new HttpError(409, "SYSTEM_ROLE", "Built-in roles cannot be edited.");
        }
        const access = await resolveAccess(admin.id);
        if (access.roles.has(role.name)) {
          throw new HttpError(409, "SELF_ROLE_EDIT", "You cannot edit a role you hold.");
        }

        let nextName = role.name;
        if (input.name !== undefined) {
          nextName = input.name.toUpperCase();
          if ((ALL_ROLE_NAMES as readonly string[]).includes(nextName)) {
            throw new HttpError(409, "ROLE_RESERVED", `"${nextName}" is a built-in role name.`);
          }
          if (nextName !== role.name) {
            const [duplicate] = await db
              .select({ id: roles.id })
              .from(roles)
              .where(eq(roles.name, nextName))
              .limit(1);
            if (duplicate) {
              throw new HttpError(409, "ROLE_EXISTS", "A role with that name already exists.");
            }
          }
        }

        let keys: string[] | null = null;
        let permissionRows: { id: number; key: string }[] = [];
        if (input.permissions !== undefined) {
          keys = [...new Set(input.permissions)].sort();
          await assertGrantableKeys(c, keys);
          permissionRows = await permissionRowsFor(keys);
        }

        await db.transaction(async (tx) => {
          await tx
            .update(roles)
            .set({
              name: nextName,
              description:
                input.description === undefined ? undefined : input.description ?? null,
            })
            .where(eq(roles.id, roleId));
          if (keys !== null) {
            await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
            if (permissionRows.length > 0) {
              await tx
                .insert(rolePermissions)
                .values(permissionRows.map((row) => ({ roleId, permissionId: row.id })));
            }
          }
        });
        invalidateAllAccess();

        c.json(ok({ id: roleId, name: nextName, permissions: keys ?? undefined }));
        return {
          entityId: roleId,
          details: `Updated role ${role.name}${nextName !== role.name ? ` → ${nextName}` : ""}${
            keys ? ` (${keys.length} permission(s))` : ""
          }.`,
          before: { name: role.name },
          after: { name: nextName, ...(keys ? { permissions: keys } : {}) },
        };
      },
    ),
  ),
);

/**
 * `DELETE /api/admin/roles/:id` — remove a custom role.
 *
 * A role that is still assigned is refused: deleting it would revoke access for
 * whoever holds it without that being the stated intent. The member list has to be
 * cleared first, deliberately.
 */
adminRoute.delete(
  "/roles/:id{[0-9]+}",
  guarded(
    "admin.action",
    withAudit(
      { action: "RBAC_ROLE_DELETED", entityType: "role", requireReason: true },
      async (c) => {
        await requireStepUp(c);
        await requirePermission("rbac.manage")(c, async () => undefined);
        const roleId = Number(c.req.param("id"));

        const [role] = await db
          .select({ id: roles.id, name: roles.name, isSystem: roles.isSystem })
          .from(roles)
          .where(eq(roles.id, roleId))
          .limit(1);
        if (!role) throw new HttpError(404, "NOT_FOUND", "Role not found.");
        if (role.isSystem) {
          throw new HttpError(409, "SYSTEM_ROLE", "Built-in roles cannot be deleted.");
        }

        const [member] = await db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(eq(userRoles.roleId, roleId))
          .limit(1);
        if (member) {
          throw new HttpError(
            409,
            "ROLE_IN_USE",
            "Remove this role from every account before deleting it.",
          );
        }

        await db.delete(roles).where(eq(roles.id, roleId));
        invalidateAllAccess();
        c.json(ok({ deleted: true }));
        return {
          entityId: roleId,
          details: `Deleted role ${role.name}.`,
          before: { name: role.name },
        };
      },
    ),
  ),
);

/** `GET /api/admin/users/:id/roles` — which roles a specific account holds. */
adminRoute.get("/users/:id{[0-9]+}/roles", async (c) => {
  const userId = Number(c.req.param("id"));
  const rows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(roles.name));
  return c.json(ok(rows.map((row) => row.name)));
});

const setUserRolesSchema = z
  .object({
    roles: z.array(z.string().trim().min(1).max(32)).max(12),
    /** Recorded in the audit log; mandatory, validated by `withAudit`. */
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

/**
 * `PUT /api/admin/users/:id/roles` — set an account's system roles.
 *
 * Only a `SUPER_ADMIN` gets here: the route requires `rbac.manage`, which the seed
 * grants to no other role. Three structural rules are enforced on top:
 *
 * - **No self-edit.** An administrator cannot change their own role set. Editing
 *   your own grants is how a compromised session turns "read the logs" into
 *   "become the super admin"; the change has to be made by a second person.
 * - **Last-super-admin protection.** Revoking `SUPER_ADMIN` from the final
 *   non-suspended holder is refused with a 409, because no operation is worth
 *   making the platform unadministerable.
 * - **Step-up.** The change requires a recent second-factor verification on the
 *   caller's session, so a hijacked-session attacker cannot hand themselves `ADMIN`
 *   — that would be privilege escalation standing on another person's stolen cookie.
 *
 * The `withAudit` wrapper records the actor, their role, the before/after role sets,
 * the request provenance and the mandatory reason in one entry.
 */
adminRoute.put(
  "/users/:id{[0-9]+}/roles",
  guarded(
    "admin.action",
    withAudit(
      { action: "RBAC_ROLES_SET", entityType: "user", requireReason: true },
      async (c) => {
        const admin = await requireStepUp(c);
        await requirePermission("rbac.manage")(c, async () => undefined);
        const userId = Number(c.req.param("id"));
        const input = setUserRolesSchema.parse(await c.req.json().catch(() => ({})));

        if (userId === admin.id) {
          throw new HttpError(409, "SELF_ROLE_CHANGE", "You cannot change your own roles.");
        }

        const [target] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!target) throw new HttpError(404, "NOT_FOUND", "User not found.");

        const requestedNames = [...new Set(input.roles)];
        const roleRows = await db
          .select({ id: roles.id, name: roles.name })
          .from(roles)
          .where(inArray(roles.name, requestedNames));
        if (roleRows.length !== requestedNames.length) {
          throw new HttpError(400, "BAD_REQUEST", "One or more role names are not recognised.");
        }
        const requestedIds = new Map(roleRows.map((role) => [role.name, role.id] as const));

        const existing = await db
          .select({ roleId: userRoles.roleId, name: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, userId));
        const existingByName = new Map(existing.map((row) => [row.name, row.roleId] as const));

        if (
          existingByName.has("SUPER_ADMIN") &&
          !requestedIds.has("SUPER_ADMIN") &&
          (await isLastActiveSuperAdmin(userId))
        ) {
          throw new HttpError(
            409,
            "LAST_SUPER_ADMIN",
            "You cannot revoke the last super administrator.",
          );
        }

        await db.transaction(async (tx) => {
          for (const [roleName, roleId] of requestedIds) {
            if (!existingByName.has(roleName)) {
              await tx.insert(userRoles).values({ userId, roleId, grantedBy: admin.id });
            }
          }
          for (const [roleName, roleId] of existingByName) {
            if (!requestedIds.has(roleName)) {
              await tx
                .delete(userRoles)
                .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
            }
          }
        });

        // The next request this user makes must see the new grants.
        invalidateAccess(userId);

        const added = [...requestedIds.keys()].filter((name) => !existingByName.has(name));
        const removed = [...existingByName.keys()].filter((name) => !requestedIds.has(name));
        const ip = requestIp(c);
        const userAgent = requestUserAgent(c);
        if (added.length) {
          await recordSecurityEvent({
            userId,
            type: "ROLE_GRANTED",
            ip,
            userAgent,
            details: { roles: added, by: admin.id },
          });
        }
        if (removed.length) {
          await recordSecurityEvent({
            userId,
            type: "ROLE_REVOKED",
            ip,
            userAgent,
            details: { roles: removed, by: admin.id },
          });
        }

        c.json(ok({ roles: requestedNames }));
        return {
          entityId: userId,
          details: `Roles → ${requestedNames.join(", ") || "none"}${
            added.length ? ` (+${added.join(",")})` : ""
          }${removed.length ? ` (-${removed.join(",")})` : ""}.`,
          before: { roles: [...existingByName.keys()].sort() },
          after: { roles: requestedNames },
        };
      },
    ),
  ),
);

const setUserStatusSchema = z
  .object({
    status: z.enum(["ACTIVE", "SUSPENDED"]),
    /** Recorded in the audit log; mandatory, validated by `withAudit`. */
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

/**
 * `PATCH /api/admin/users/:id/status` — suspend or restore an account.
 *
 * Suspension is the dangerous direction: the account's sessions die immediately
 * (`suspendUser` deletes them) and the login path refuses the account's password
 * until it is restored. The structural rules are `users.manage` permission,
 * step-up, no self-suspension, and the same last-super-admin protection as role
 * changes. The `withAudit` wrapper records the reason and the before/after state.
 */
adminRoute.patch(
  "/users/:id{[0-9]+}/status",
  guarded(
    "admin.action",
    withAudit(
      { action: "USER_STATUS_CHANGED", entityType: "user", requireReason: true },
      async (c) => {
        const admin = await requireStepUp(c);
        await requirePermission("users.manage")(c, async () => undefined);
        const userId = Number(c.req.param("id"));
        const input = setUserStatusSchema.parse(await c.req.json().catch(() => ({})));

        if (userId === admin.id) {
          throw new HttpError(
            409,
            "SELF_STATUS_CHANGE",
            "You cannot change your own account status.",
          );
        }

        const [target] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!target) throw new HttpError(404, "NOT_FOUND", "User not found.");

        if (input.status === "SUSPENDED") {
          const targetAccess = await resolveAccess(userId);
          if (targetAccess.roles.has("SUPER_ADMIN") && (await isLastActiveSuperAdmin(userId))) {
            throw new HttpError(
              409,
              "LAST_SUPER_ADMIN",
              "You cannot suspend the last super administrator.",
            );
          }
          const revokedSessions = await suspendUser(userId);
          invalidateAccess(userId);
          await recordSecurityEvent({
            userId,
            type: "ACCOUNT_SUSPENDED",
            ip: requestIp(c),
            userAgent: requestUserAgent(c),
            details: { by: admin.id, revokedSessions },
          });
          c.json(ok({ status: "SUSPENDED", revokedSessions }));
          return {
            entityId: userId,
            details: "Suspended the account.",
            before: { status: "ACTIVE" },
            after: { status: "SUSPENDED", revokedSessions },
          };
        }

        await restoreUser(userId);
        invalidateAccess(userId);
        await recordSecurityEvent({
          userId,
          type: "ACCOUNT_UNSUSPENDED",
          ip: requestIp(c),
          userAgent: requestUserAgent(c),
          details: { by: admin.id },
        });
        c.json(ok({ status: "ACTIVE" }));
        return {
          entityId: userId,
          details: "Restored the account.",
          before: { status: "SUSPENDED" },
          after: { status: "ACTIVE" },
        };
      },
    ),
  ),
);

/* ----------------- categories: create / edit / delete / reorder ------------- */

/**
 * `POST /api/admin/categories` — add a category.
 *
 * Audit-only mutation, so no `requireReason`: naming a category is routine. The
 * rename/merge cases — the ones with real blast radius — are the update and delete
 * handlers below.
 */
adminRoute.post(
  "/categories",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_CREATED", entityType: "category" }, async (c) => {
      await requirePermission("categories.manage")(c, async () => undefined);
      const input = categoryWriteSchema.parse(await c.req.json().catch(() => ({})));
      const created = await createCategory(input);

      c.json(ok(created), 201);
      return {
        entityId: created.id,
        details: `Created category "${created.name}".`,
        after: { name: created.name, slug: created.slug, parentId: created.parentId },
      };
    }),
  ),
);

adminRoute.patch(
  "/categories/reorder",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_REORDERED", entityType: "category" }, async (c) => {
      await requirePermission("categories.manage")(c, async () => undefined);
      const input = categoryReorderSchema.parse(await c.req.json().catch(() => ({})));
      const result = await reorderCategories(input.ids);

      c.json(ok(result));
      return {
        details: `Reordered ${result.updated} categor${result.updated === 1 ? "y" : "ies"}.`,
        after: { ids: input.ids },
      };
    }),
  ),
);

adminRoute.patch(
  "/categories/:id{[0-9]+}",
  guarded(
    "admin.action",
    withAudit({ action: "CATEGORY_UPDATED", entityType: "category" }, async (c) => {
      await requirePermission("categories.manage")(c, async () => undefined);
      const id = Number(c.req.param("id"));
      const patch = categoryUpdateSchema.parse(await c.req.json().catch(() => ({})));
      const result = await updateCategory(id, patch);

      c.json(ok({ id: result.id, updated: true }));
      return {
        entityId: id,
        details: "Updated the category.",
        before: result.before,
        after: result.after,
      };
    }),
  ),
);

/**
 * `DELETE /api/admin/categories/:id` — remove a category, moving its listings.
 *
 * The reassignment is the whole point: `products.category_id` is FK-restrict, so a
 * bare delete fails, and the handler would rather answer "which category should
 * these move to?" than leak a foreign-key error. See `deleteCategory`.
 */
adminRoute.delete(
  "/categories/:id{[0-9]+}",
  guarded(
    "admin.action",
    withAudit(
      { action: "CATEGORY_DELETED", entityType: "category", requireReason: true },
      async (c) => {
        await requirePermission("categories.manage")(c, async () => undefined);
        const id = Number(c.req.param("id"));
        const input = categoryDeleteSchema.parse(await c.req.json().catch(() => ({})));
        const result = await deleteCategory(id, input.reassignToId);

        c.json(ok(result));
        return {
          entityId: id,
          details: `Deleted category "${result.name}" and moved ${result.reassigned} listing(s).`,
          before: { name: result.name },
          after: { reassignToId: result.reassignToId },
        };
      },
    ),
  ),
);

/* --------------------------------- CMS: catalogue --------------------------- */

/**
 * `GET /api/admin/cms/catalogue` — the vocabularies the content editor renders.
 *
 * Placements, statuses and the known block keys travel from the server so the form
 * cannot offer a placement the API would reject, and a new block key becomes
 * editable by adding it to `BLOCK_DEFINITIONS` alone.
 */
adminRoute.get("/cms/catalogue", async (c) => {
  return c.json(
    ok({
      placements: BANNER_PLACEMENTS,
      bannerStatuses: BANNER_STATUSES,
      blockStatuses: BLOCK_STATUSES,
      blocks: blockCatalogue(),
    }),
  );
});

/* --------------------------------- CMS: banners ----------------------------- */

adminRoute.get("/cms/banners", async (c) => {
  return c.json(ok(await listAdminBanners()));
});

adminRoute.post(
  "/cms/banners",
  guarded(
    "admin.action",
    withAudit({ action: "CMS_BANNER_CREATED", entityType: "cms_banner" }, async (c) => {
      await requirePermission("content.manage")(c, async () => undefined);
      const input = bannerInputSchema.parse(await c.req.json().catch(() => ({})));
      const result = await createBanner(input, (await requireUser(c)).id);

      c.json(ok({ id: result.id }), 201);
      return {
        entityId: result.id,
        details: `Created a ${input.placement} banner "${input.title}".`,
        after: result.after,
      };
    }),
  ),
);

/**
 * `PATCH /api/admin/cms/banners/reorder` — the order a placement renders in.
 *
 * Declared before the `:id` route so the literal is never read as an id (the digit
 * constraint already makes that impossible, but keeping the literal first reads
 * better and costs nothing).
 */
adminRoute.patch(
  "/cms/banners/reorder",
  guarded(
    "admin.action",
    withAudit({ action: "CMS_BANNERS_REORDERED", entityType: "cms_banner" }, async (c) => {
      await requirePermission("content.manage")(c, async () => undefined);
      const input = bannerReorderSchema.parse(await c.req.json().catch(() => ({})));
      const result = await reorderBanners(input.placement, input.ids);

      c.json(ok(result));
      return {
        details: `Reordered ${result.updated} ${input.placement} banner(s).`,
        after: { placement: input.placement, ids: input.ids },
      };
    }),
  ),
);

adminRoute.patch(
  "/cms/banners/:id{[0-9]+}",
  guarded(
    "admin.action",
    withAudit({ action: "CMS_BANNER_UPDATED", entityType: "cms_banner" }, async (c) => {
      await requirePermission("content.manage")(c, async () => undefined);
      const id = Number(c.req.param("id"));
      const patch = bannerUpdateSchema.parse(await c.req.json().catch(() => ({})));
      const result = await updateBanner(id, patch);

      c.json(ok({ id: result.id }));
      return {
        entityId: id,
        details: "Updated the banner.",
        before: result.before,
        after: result.after,
      };
    }),
  ),
);

adminRoute.delete(
  "/cms/banners/:id{[0-9]+}",
  guarded(
    "admin.action",
    withAudit(
      { action: "CMS_BANNER_DELETED", entityType: "cms_banner", requireReason: true },
      async (c) => {
        await requirePermission("content.manage")(c, async () => undefined);
        const id = Number(c.req.param("id"));
        const result = await deleteBanner(id);

        c.json(ok({ id, deleted: true }));
        return { entityId: id, details: "Deleted the banner.", before: result.before };
      },
    ),
  ),
);

/* --------------------------------- CMS: blocks ------------------------------ */

adminRoute.get("/cms/blocks", async (c) => {
  return c.json(ok(await listAdminBlocks()));
});

adminRoute.get("/cms/blocks/:key", async (c) => {
  const block = await getAdminBlock(c.req.param("key"));
  if (!block) throw new HttpError(404, "NOT_FOUND", "Block not found.");
  return c.json(ok(block));
});

/**
 * `PUT /api/admin/cms/blocks/:key` — save a block.
 *
 * Upsert, because a known key (`home.how_it_works`) may not have a row yet and the
 * editor should not have to distinguish "create" from "edit". Saving keeps the
 * stored status unless the body names one, so the editor's Save is never an
 * accidental publish — publishing is the explicit route below.
 */
adminRoute.put(
  "/cms/blocks/:key",
  guarded(
    "admin.action",
    withAudit({ action: "CMS_BLOCK_SAVED", entityType: "cms_block" }, async (c) => {
      await requirePermission("content.manage")(c, async () => undefined);
      const key = c.req.param("key");
      const input = blockWriteSchema.parse(await c.req.json().catch(() => ({})));
      const result = await upsertBlock(key, input, (await requireUser(c)).id);

      c.json(ok({ id: result.id, blockKey: result.blockKey, status: result.after.status }));
      return {
        entityId: result.id,
        details: `${result.action === "created" ? "Created" : "Saved"} block "${key}".`,
        before: result.before,
        after: result.after,
      };
    }),
  ),
);

adminRoute.patch(
  "/cms/blocks/:key/status",
  guarded(
    "admin.action",
    withAudit({ action: "CMS_BLOCK_STATUS_SET", entityType: "cms_block" }, async (c) => {
      await requirePermission("content.manage")(c, async () => undefined);
      const key = c.req.param("key");
      const input = z
        .object({ status: z.enum(BLOCK_STATUSES) })
        .parse(await c.req.json().catch(() => ({})));
      const result = await setBlockStatus(key, input.status);

      c.json(ok({ blockKey: key, status: input.status }));
      return {
        entityId: result.id,
        details: `Set block "${key}" to ${input.status}.`,
        before: result.before,
        after: result.after,
      };
    }),
  ),
);

adminRoute.delete(
  "/cms/blocks/:key",
  guarded(
    "admin.action",
    withAudit(
      { action: "CMS_BLOCK_DELETED", entityType: "cms_block", requireReason: true },
      async (c) => {
        await requirePermission("content.manage")(c, async () => undefined);
        const key = c.req.param("key");
        const result = await deleteBlock(key);

        c.json(ok({ blockKey: key, deleted: true }));
        return { details: `Deleted block "${key}".`, before: result.before };
      },
    ),
  ),
);

/**
 * `GET /api/admin/cms/versions/:entityType/:id` — a block's or banner's history.
 *
 * Served from the audit trail (see `listCmsVersions`), so the editor's history tab
 * shows exactly what the audit log already records — no second copy to drift.
 */
adminRoute.get("/cms/versions/:entityType/:id{[0-9]+}", async (c) => {
  const entityType = z
    .enum(["cms_block", "cms_banner"])
    .parse(c.req.param("entityType"));
  const id = Number(c.req.param("id"));
  const limitRaw = Number(c.req.query("limit") ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
  return c.json(ok(await listCmsVersions(entityType, id, limit)));
});

/* ---------------------- product relations + bulk catalogue ------------------ */

/**
 * `GET /api/admin/products/:id/relations` — what touches this listing.
 *
 * Orders, rentals, reviews and reports in one request, so the detail drawer can
 * show "this is the listing with a dispute and two bad reviews" without four round
 * trips. Reads are capped; the full reports/moderation surfaces carry the rest.
 */
adminRoute.get("/products/:id{[0-9]+}/relations", async (c) => {
  const id = Number(c.req.param("id"));
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  return c.json(ok(await listAdminProductRelations(id)));
});

adminRoute.patch(
  "/products/bulk-category",
  guarded(
    "admin.action",
    withAudit({ action: "PRODUCTS_CATEGORY_MOVED", entityType: "product" }, async (c) => {
      await requirePermission("products.moderate")(c, async () => undefined);
      const input = bulkCategorySchema.parse(await c.req.json().catch(() => ({})));
      const result = await bulkMoveAdminProductCategory(input.ids, input.categoryId);

      c.json(ok(result));
      return {
        details: `Moved ${result.updated} listing(s) to category ${result.categoryId}.`,
        after: { ids: input.ids, categoryId: input.categoryId },
      };
    }),
  ),
);

/**
 * `PATCH /api/admin/products/bulk-delete` — remove many listings at once.
 *
 * A `PATCH` with an explicit `ids` body rather than `DELETE /products` with a body:
 * the shared `DELETE /products` prefix already means archive, and keeping bulk
 * delete as a named action makes the intent (and the audit entry) unambiguous.
 */
adminRoute.patch(
  "/products/bulk-delete",
  guarded(
    "admin.action",
    withAudit(
      { action: "PRODUCTS_DELETED", entityType: "product", requireReason: true },
      async (c) => {
        await requirePermission("products.moderate")(c, async () => undefined);
        const input = z
          .object({ ids: z.array(z.number().int().positive()).min(1).max(200) })
          .parse(await c.req.json().catch(() => ({})));
        const result = await bulkDeleteAdminProducts(input.ids);

        c.json(ok(result));
        return {
          details: `Deleted ${result.deleted}, archived ${result.archived}.`,
          after: { ids: input.ids, deleted: result.deleted, archived: result.archived },
        };
      },
    ),
  ),
);
