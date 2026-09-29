import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { pool } from "./db";
import { ok } from "./lib/api";
import { onErrorHandler } from "./lib/api";
import { attachUser } from "./lib/auth";
import { auth } from "./routes/auth";
import { productsRoute, categoriesRoute } from "./routes/products";
import { favoritesRoute, cartRoute, addressesRoute } from "./routes/market";
import { ordersRoute, rentalsRoute } from "./routes/orders";
import { paymentsRoute } from "./routes/payments";
import { reviewsRoute, messagesRoute, notificationsRoute, usersRoute } from "./routes/social";
import { sellerRoute } from "./routes/seller";
import { storageRoute } from "./routes/storage";
import { sellerOrdersRoute } from "./routes/seller-orders";
import { chatRoute } from "./routes/chat";
import { adminRoute } from "./routes/admin";
import { and, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { products, users } from "./schema";
import { PUBLIC_PRODUCT_STATUSES } from "./lib/product-status";

const app = new Hono();

app.use(logger());
app.onError(onErrorHandler);
app.use("/api/*", attachUser);

/* --------------------------------- health ---------------------------------- */

app.get("/api/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json(ok({ status: "ok", database: "connected" }));
  } catch (error) {
    console.error("Database health check failed:", error);
    return c.json(
      ok({
        status: "unavailable",
        database: "unavailable",
      }),
      503,
    );
  }
});

/* -------------------------------- marketplace ------------------------------- */

app.get("/api/stats", async (c) => {
  try {
    // `activeListings` means listings a shopper can actually find, so it counts
    // the publicly visible statuses rather than every row in the table (drafts
    // and archived listings are not "active" by any reading of the word).
    const publicStatuses = [...PUBLIC_PRODUCT_STATUSES];
    const [productCount] = await db
      .select({ value: sql<number>`COUNT(*)` })
      .from(products)
      .where(inArray(products.status, publicStatuses));
    const [rentalCount] = await db
      .select({ value: sql<number>`COUNT(*)` })
      .from(products)
      .where(
        and(
          inArray(products.status, publicStatuses),
          inArray(products.listingType, ["RENT", "BOTH"]),
        ),
      );
    const [sellerCount] = await db
      .select({ value: sql<number>`COUNT(*)` })
      .from(users)
      .where(sql`${users.role} IN ('SELLER','ADMIN')`);
    return c.json(
      ok({
        activeListings: Number(productCount.value),
        availableRentals: Number(rentalCount.value),
        verifiedSellers: Number(sellerCount.value),
      }),
    );
  } catch (error) {
    console.error("Stats failed:", error);
    return c.json(ok({ activeListings: 0, availableRentals: 0, verifiedSellers: 0 }));
  }
});

/* ---------------------------------- routes ---------------------------------- */

app.route("/api/auth", auth);
app.route("/api/categories", categoriesRoute);
app.route("/api/products", productsRoute);
app.route("/api/products/search", productsRoute);
app.route("/api/favorites", favoritesRoute);
app.route("/api/cart", cartRoute);
app.route("/api/addresses", addressesRoute);
app.route("/api/orders", ordersRoute);
app.route("/api/payments", paymentsRoute);
app.route("/api/rentals", rentalsRoute);
app.route("/api/reviews", reviewsRoute);
app.route("/api/users", usersRoute);
app.route("/api/conversations", messagesRoute);
app.route("/api/notifications", notificationsRoute);
app.route("/api/seller/orders", sellerOrdersRoute);
app.route("/api/seller", sellerRoute);
app.route("/api/storage", storageRoute);
app.route("/api/chat", chatRoute);
app.route("/api/admin", adminRoute);

app.notFound((c) => {
  return c.json(
    { success: false, error: { code: "NOT_FOUND", message: "API route not found." } },
    404,
  );
});

const port = Number(process.env.API_PORT ?? 3001);
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Revaro API listening on http://localhost:${info.port}`);
});

function closeServer() {
  void pool.end().catch((error: unknown) => {
    console.error("Failed to close the database pool:", error);
  });
}

process.once("SIGINT", () => {
  server.close();
  closeServer();
});
process.once("SIGTERM", () => {
  server.close();
  closeServer();
});
