import { Hono } from "hono";
import { ne, and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { orders, products, reports, rentals, reviews, users } from "../schema";
import { ok, HttpError } from "../lib/api";
import { requireAdmin } from "../lib/auth";
import { PRODUCT_STATUSES } from "../lib/product-status";

export const adminRoute = new Hono();

adminRoute.use("*", async (c, next) => {
  requireAdmin(c);
  await next();
});

/* -------------------------------- dashboard -------------------------------- */

adminRoute.get("/stats", async (c) => {
  const [userCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(users);
  const [productCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(products);
  const [orderCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(orders);
  const [rentalCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(rentals);
  const [reviewCount] = await db.select({ value: sql<number>`COUNT(*)` }).from(reviews);
  const [openReports] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(reports)
    .where(eq(reports.status, "OPEN"));
  const [grossVolume] = await db
    .select({ value: sql<number>`COALESCE(SUM(${orders.total}), 0)` })
    .from(orders)
    .where(ne(orders.status, "PENDING_PAYMENT"));

  return c.json(
    ok({
      users: Number(userCount.value),
      products: Number(productCount.value),
      orders: Number(orderCount.value),
      rentals: Number(rentalCount.value),
      reviews: Number(reviewCount.value),
      openReports: Number(openReports.value),
      grossVolume: Number(grossVolume.value),
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

adminRoute.get("/products", async (c) => {
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      status: products.status,
      listingType: products.listingType,
      viewCount: products.viewCount,
      favoriteCount: products.favoriteCount,
      createdAt: products.createdAt,
      sellerName: users.name,
    })
    .from(products)
    .innerJoin(users, eq(products.sellerId, users.id))
    .orderBy(desc(products.createdAt))
    .limit(200);
  return c.json(ok(rows));
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
