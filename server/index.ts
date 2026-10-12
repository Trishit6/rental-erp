import { pool } from "./db";
import { ok } from "./lib/api";
import { onErrorHandler } from "./lib/api";
import { attachUser } from "./lib/auth";
import { assertServerEnv } from "./lib/env";
import { createApp, Router, type Ctx } from "./lib/http";
import { originGuard, securityHeaders, cors, csrfProtection } from "./lib/security";
import { requestId, requestIdOf } from "./lib/request-id";
import { configureRateLimitStoreFromEnv } from "./lib/rate-limit";
import { logger, redactUrl } from "./lib/logger";
import { auth } from "./routes/auth";
import { productsRoute, categoriesRoute } from "./routes/products";
import { cmsRoute } from "./routes/cms";
import { favoritesRoute, cartRoute, addressesRoute } from "./routes/market";
import { ordersRoute, rentalsRoute } from "./routes/orders";
import { paymentsRoute } from "./routes/payments";
import { reviewsRoute } from "./routes/reviews";
import { reportsRoute } from "./routes/reports";
import { supportRoute } from "./routes/support";
import { usersRoute } from "./routes/social";
import { messagesRoute } from "./routes/messages";
import { notificationsRoute } from "./routes/notifications";
import { activityRoute } from "./routes/activity";
import { sellerRoute } from "./routes/seller";
import { sellersRoute } from "./routes/sellers";
import { storageRoute } from "./routes/storage";
import { sellerOrdersRoute } from "./routes/seller-orders";
import { walletRoute } from "./routes/wallet";
import { adminRoute } from "./routes/admin";
import { and, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { products, users } from "./schema";
import { PUBLIC_PRODUCT_STATUSES } from "./lib/product-status";
import type { RequestHandler } from "express";

/**
 * The Revaro API.
 *
 * Express, with `Router` (`lib/http`) providing the `c.req.param()` /
 * `c.json()` / `route(prefix, sub)` shape the route files are written against.
 * The route table below is unchanged from the Hono version it replaces.
 */

/**
 * One structured line per request, through the redacting logger.
 *
 * The URL is the one place a credential travels *outside* a body — a password
 * reset link, a signed image — and it reaches the request log verbatim. Logging
 * through `redactUrl` keeps `?token=…` out of the stream while leaving the path
 * readable. Request and response bodies are never logged at all (see
 * `mayLogBody`), so passwords, MFA codes, card/UPI data and payment intents
 * cannot reach a log line even if a route debug-logs its inputs later.
 */
const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info("request", {
      requestId: requestIdOf(req),
      method: req.method,
      url: redactUrl(req.originalUrl),
      status: res.statusCode,
      ms: Number(ms.toFixed(1)),
    });
  });
  next();
};

const { app, router } = createApp({ captureRawBody: true });

// Configure rate-limit storage from the environment before mounting middleware.
configureRateLimitStoreFromEnv();

/**
 * Fail fast, and fail in the terminal rather than in a user's browser.
 *
 * A missing JWT secret is an operator problem: it is discovered here, once, with
 * the variable's name — not as a 500 on the first sign-in attempt or, worse, as
 * a *default* secret that happens to work locally and signs production tokens
 * anyone can forge. Runs after the imports above, which is what loads `.env`.
 */
assertServerEnv();

/**
 * Request-scoped middleware, mounted ahead of every API route.
 *
 * A `Router` rather than `app.use` so `attachUser` keeps its `(c, next)` shape and
 * the session it publishes lands in the same `Ctx` state the route guards read.
 */
const beforeApi = new Router();
beforeApi.use(attachUser);

// Headers first: they apply to every response, including the ones the guard and
// the error handler produce later.
app.use(securityHeaders);
app.use(requestId);
// CORS for any foreign origins we allow; must run before the origin/CSRF gates.
app.use(cors);
app.use(requestLogger);
// Origin check before any session work, so a foreign origin is refused without
// reading a cookie. `SameSite=Lax` on both auth cookies is the browser half of
// the same defence; see `server/lib/security.ts` for why both are needed.
app.use("/api", originGuard);
app.use("/api", csrfProtection);
app.use("/api", beforeApi.toExpress());

/* --------------------------------- health ---------------------------------- */

router.get("/api/health", async (c: Ctx) => {
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

router.get("/api/stats", async (c: Ctx) => {
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

router.route("/api/auth", auth);
router.route("/api/categories", categoriesRoute);
router.route("/api/cms", cmsRoute);
router.route("/api/products", productsRoute);
router.route("/api/products/search", productsRoute);
router.route("/api/favorites", favoritesRoute);
router.route("/api/cart", cartRoute);
router.route("/api/addresses", addressesRoute);
router.route("/api/orders", ordersRoute);
router.route("/api/payments", paymentsRoute);
router.route("/api/rentals", rentalsRoute);
router.route("/api/reviews", reviewsRoute);
router.route("/api/reports", reportsRoute);
router.route("/api/support", supportRoute);
router.route("/api/users", usersRoute);
router.route("/api/conversations", messagesRoute);
router.route("/api/notifications", notificationsRoute);
// The session user's own history. Mounted under its own prefix because it takes no
// user id — see `routes/activity.ts`.
router.route("/api/activity", activityRoute);
router.route("/api/seller/orders", sellerOrdersRoute);
// The wallet sits under `/api/seller/` for the same reason the orders router does:
// it is the signed-in seller's own money, and keeping the prefix means the guard
// boundary is visible in the route tree rather than being a flag on one handler.
router.route("/api/seller/wallet", walletRoute);
router.route("/api/seller", sellerRoute);
// The public shopfront, deliberately a *different* prefix: it is mounted where no
// guard applies, which is the point. See the note at the top of `routes/sellers.ts`.
router.route("/api/sellers", sellersRoute);
router.route("/api/storage", storageRoute);
router.route("/api/admin", adminRoute);

router.onError(onErrorHandler);
app.use(router.toExpress());

// Unmatched routes. Mounted after the router so it only sees what fell through,
// and its shape matches the Hono `notFound` this replaces.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "API route not found." },
  });
});

// Express identifies itself by default; Revaro's API does not advertise its
// stack, and the security headers also remove X-Powered-By.
app.disable("x-powered-by");

const port = Number(process.env.API_PORT ?? 3001);
const server = app.listen(port, () => {
  console.log(`Revaro API listening on http://localhost:${port}`);
});

function closeServer() {
  void pool.end().catch((error: unknown) => {
    console.error("Failed to close the database pool:", error);
  });
}

process.once("SIGINT", () => {
  server.close(closeServer);
});
process.once("SIGTERM", () => {
  server.close(closeServer);
});

export { app, router, Router };
