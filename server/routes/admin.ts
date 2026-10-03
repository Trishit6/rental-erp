import { Router } from "../lib/http";
import { z } from "zod";
import { ne, and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { orders, payouts, products, reports, rentals, reviews, users } from "../schema";
import { ok, HttpError, buildPagination } from "../lib/api";
import { requireAdmin } from "../lib/auth";
import {
  adminProductsQuerySchema,
  listAdminProductFacets,
  listAdminProducts,
} from "../lib/admin-products";
import { PRODUCT_STATUSES, PUBLIC_PRODUCT_STATUSES } from "../lib/product-status";
import { isPayoutStatus, listAllPayouts, setPayoutStatus } from "../lib/wallet";

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

/* ---------------------------------- users ---------------------------------- */

adminRoute.get("/users", async (c) => {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      verified: users.verified,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(200);
  return c.json(ok(rows));
});

adminRoute.patch("/users/:id/suspend", async (c) => {
  const id = Number(c.req.param("id"));
  const [updated] = await db
    .update(users)
    .set({ role: "SUSPENDED" })
    .where(and(eq(users.id, id), eq(users.role, "USER")));
  if (!updated) {
    throw new HttpError(404, "NOT_FOUND", "User not found or cannot be suspended.");
  }
  return c.json(ok({ suspended: true }));
});

adminRoute.patch("/users/:id/unsuspend", async (c) => {
  const id = Number(c.req.param("id"));
  const [updated] = await db
    .update(users)
    .set({ role: "USER" })
    .where(and(eq(users.id, id), eq(users.role, "SUSPENDED")));
  if (!updated) {
    throw new HttpError(404, "NOT_FOUND", "User not found or is not suspended.");
  }
  return c.json(ok({ unsuspended: true }));
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
  await db.update(products).set({ status: body.status }).where(eq(products.id, id));
  return c.json(ok({ updated: true }));
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
