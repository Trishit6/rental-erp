import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  orderItems,
  orders,
  productImages,
  products,
  productTags,
  reports,
  rentals,
  reviews,
  sellerProfiles,
  transactions,
  users,
} from "../schema";
import { ok, HttpError } from "../lib/api";
import { requireUser } from "../lib/auth";
import { PUBLIC_PRODUCT_STATUSES, SELLER_SETTABLE_STATUSES } from "../lib/product-status";
import { createProduct, productInputSchema } from "./products";

export const sellerRoute = new Hono();

sellerRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

/* ------------------------------ create product ------------------------------ */

sellerRoute.post("/products", async (c) => {
  const user = c.get("user")!;
  const input = productInputSchema.parse(await c.req.json());
  const product = await createProduct(user.id, input);

  // Any user who lists becomes a seller
  await db
    .update(users)
    .set({ role: "SELLER" })
    .where(and(eq(users.id, user.id), eq(users.role, "USER")));

  return c.json(ok(product), 201);
});

/* ------------------------------- my products -------------------------------- */

sellerRoute.get("/products", async (c) => {
  const user = c.get("user")!;
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      status: products.status,
      listingType: products.listingType,
      condition: products.condition,
      purchasePrice: products.purchasePrice,
      rentalPricePerDay: products.rentalPricePerDay,
      quantity: products.quantity,
      availableQuantity: products.availableQuantity,
      viewCount: products.viewCount,
      favoriteCount: products.favoriteCount,
      createdAt: products.createdAt,
      primaryImage: sql<string | null>`(
        SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id}
        ORDER BY pi.sort_order ASC LIMIT 1
      )`,
    })
    .from(products)
    .where(eq(products.sellerId, user.id))
    .orderBy(desc(products.createdAt));
  return c.json(ok(rows));
});

/* ------------------------------- edit product ------------------------------- */

const productUpdateSchema = productInputSchema.partial();

sellerRoute.patch("/products/:id", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const input = productUpdateSchema.parse(await c.req.json());

  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.sellerId, user.id)))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const { images: _images, tags: _tags, ...productFields } = input;
  await db
    .update(products)
    .set({
      ...productFields,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id));

  if (input.images) {
    await db.delete(productImages).where(eq(productImages.productId, id));
    if (input.images.length) {
      await db.insert(productImages).values(
        input.images.map((url, index) => ({
          productId: id,
          url,
          sortOrder: index,
        })),
      );
    }
  }

  if (input.tags) {
    await db.delete(productTags).where(eq(productTags.productId, id));
    if (input.tags.length) {
      await db
        .insert(productTags)
        .values(input.tags.map((tag) => ({ productId: id, tag: tag.toLowerCase() })));
    }
  }

  const [updated] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return c.json(ok(updated));
});

/* ------------------------------ status changes ------------------------------ */

sellerRoute.patch("/products/:id/status", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const { status } = (await c.req.json()) as { status: string };
  // A seller may not assert `OUT_OF_STOCK` (it is derived from inventory) nor
  // `DRAFT` (that is a creation-time state, not a transition).
  const allowed: readonly string[] = SELLER_SETTABLE_STATUSES;
  if (!allowed.includes(status)) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid status.");
  }
  const [updated] = await db
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.sellerId, user.id)));
  if (!updated) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  return c.json(ok(updated));
});

sellerRoute.delete("/products/:id", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, id), eq(products.sellerId, user.id)))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  await db.delete(products).where(eq(products.id, id));
  return c.json(ok({ deleted: true }));
});

/* --------------------------------- earnings --------------------------------- */

sellerRoute.get("/earnings", async (c) => {
  const user = c.get("user")!;

  const [saleTotals] = await db
    .select({
      gross: sql<number>`COALESCE(SUM(${orderItems.lineTotal}), 0)`,
    })
    .from(orderItems)
    .where(and(eq(orderItems.sellerId, user.id), eq(orderItems.mode, "BUY")));

  const [rentalTotals] = await db
    .select({
      gross: sql<number>`COALESCE(SUM(${rentals.rentalSubtotal}), 0)`,
    })
    .from(rentals)
    .where(
      and(
        eq(rentals.ownerId, user.id),
        inArray(rentals.status, ["CONFIRMED", "ACTIVE", "RETURNED", "RETURN_PENDING", "COMPLETED"]),
      ),
    );

  const [pendingOrders] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(eq(orderItems.sellerId, user.id), inArray(orders.status, ["PAID", "PROCESSING"])));

  return c.json(
    ok({
      saleEarnings: Number(saleTotals.gross),
      rentalEarnings: Number(rentalTotals.gross),
      pendingOrderCount: Number(pendingOrders.value),
      saleFeePercent: 5,
      rentalFeePercent: 10,
    }),
  );
});

/* ----------------------------- seller transactions --------------------------- */

sellerRoute.get("/transactions", async (c) => {
  const user = c.get("user")!;
  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      status: transactions.status,
      createdAt: transactions.createdAt,
      orderId: transactions.orderId,
    })
    .from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt))
    .limit(100);
  return c.json(ok(rows));
});

/* ---------------------------------- reports --------------------------------- */

sellerRoute.post("/reports", async (c) => {
  const user = c.get("user")!;
  const input = z
    .object({
      productId: z.number().int().positive().optional(),
      reportedUserId: z.number().int().positive().optional(),
      reason: z.string().trim().min(3).max(32),
      details: z.string().trim().max(1000).optional(),
    })
    .parse(await c.req.json());
  const [created] = await db.insert(reports).values({ ...input, reporterId: user.id });
  return c.json(ok(created), 201);
});

/* ------------------------------- seller profile ------------------------------ */

sellerRoute.get("/profile/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [seller] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      verified: users.verified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!seller) throw new HttpError(404, "NOT_FOUND", "Seller not found.");

  const [profile] = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, id))
    .limit(1);

  const [listingCount] = await db
    .select({ value: sql<number>`COUNT(*)` })
    .from(products)
    .where(and(eq(products.sellerId, id), inArray(products.status, [...PUBLIC_PRODUCT_STATUSES])));

  const [ratingAgg] = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(reviews)
    .where(eq(reviews.sellerId, id));

  return c.json(
    ok({
      ...seller,
      bio: profile?.bio ?? null,
      responseRateHours: profile?.responseRateHours ?? null,
      listingCount: Number(listingCount.value),
      ratingAverage: Math.round(Number(ratingAgg.avg) * 10) / 10,
      ratingCount: Number(ratingAgg.count),
    }),
  );
});
