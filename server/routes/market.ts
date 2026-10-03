import { Router } from "../lib/http";
import { z } from "zod";
import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { addresses, cartItems, carts, categories, favorites, products, users } from "../schema";
import { ok, buildPagination, HttpError } from "../lib/api";
import { isPurchasable, PUBLIC_PRODUCT_STATUSES } from "../lib/product-status";
import { requireUser } from "../lib/auth";
import { assertRentalAvailability } from "../lib/rental-availability";
import {
  clearCart,
  getOrCreateCart,
  mergeCartItem,
  priceCartLine,
  removeCartItem,
  updateCartItem,
  validateCartLine,
  cartProductColumns,
  type CartProduct,
} from "../lib/cart";
import { normalizeConditions, PRODUCT_AVAILABILITY, PRODUCT_MODES } from "../lib/product-filters";
import { normalizeProductCard, productCardColumns } from "./products";

export const favoritesRoute = new Router();
export const cartRoute = new Router();
export const addressesRoute = new Router();

/* -------------------------------- favorites -------------------------------- */

/**
 * The favourites a user owns — never anyone else's. Every handler below derives
 * the owner from the session (`requireUser`), so a product id is the only thing a
 * client can influence. `userId` is never read from the request.
 */
favoritesRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

/** Sort keys the favourites list can actually order by. */
export const FAVORITE_SORTS = ["recent", "oldest", "price_asc", "price_desc"] as const;
type FavoriteSort = (typeof FAVORITE_SORTS)[number];

const favoriteListSchema = z.object({
  // The same vocabulary Browse uses — no second filter language.
  search: z.string().trim().max(120).optional(),
  mode: z.enum(PRODUCT_MODES).optional(),
  condition: z.string().trim().max(120).optional(),
  availability: z.enum(PRODUCT_AVAILABILITY).optional(),
  sort: z.enum(FAVORITE_SORTS).optional().default("recent"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
});

/** Listing-type narrowing — identical semantics to product search. */
function favoriteModeCondition(mode?: string): SQL | undefined {
  if (mode === "rent") return inArray(products.listingType, ["RENT", "BOTH"]);
  if (mode === "buy") return inArray(products.listingType, ["SALE", "BOTH"]);
  if (mode === "rent-and-buy") return eq(products.listingType, "BOTH");
  return undefined;
}

function favoriteOrderBy(sort: FavoriteSort) {
  switch (sort) {
    case "oldest":
      return asc(favorites.createdAt);
    case "price_asc":
      return asc(
        sql`COALESCE(${products.purchasePrice}, ${products.rentalPricePerDay}, 999999999)`,
      );
    case "price_desc":
      return desc(sql`COALESCE(${products.purchasePrice}, ${products.rentalPricePerDay}, 0)`);
    default:
      return desc(favorites.createdAt);
  }
}

/**
 * The saved list, filtered/sorted/paginated server-side so a large wishlist is
 * never shipped to the browser just to be filtered there. Each row is the same
 * card shape the rest of the app renders, plus the favourite's own id and
 * `savedAt`, so the page needs no second request per product.
 */
favoritesRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const query = favoriteListSchema.parse(c.req.query());

  const conditions: SQL[] = [eq(favorites.userId, user.id)];

  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      or(
        like(products.title, pattern),
        like(products.description, pattern),
        like(products.brand, pattern),
        like(products.location, pattern),
      )!,
    );
  }
  const modeCondition = favoriteModeCondition(query.mode);
  if (modeCondition) conditions.push(modeCondition);

  const conditionFilter = normalizeConditions(query.condition);
  if (conditionFilter.length) conditions.push(inArray(products.condition, conditionFilter));

  if (query.availability) {
    conditions.push(sql`${products.availableQuantity} > 0`);
  }

  const where = and(...conditions);
  const rows = await db
    .select({
      favoriteId: favorites.id,
      savedAt: favorites.createdAt,
      ...productCardColumns(user.id),
    })
    .from(favorites)
    .innerJoin(products, eq(favorites.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(favoriteOrderBy(query.sort))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(favorites)
    .innerJoin(products, eq(favorites.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(where);

  return c.json(
    ok(
      rows.map((row) => ({
        ...normalizeProductCard(row),
        isFavorited: true as const,
      })),
      buildPagination(query.page, query.pageSize, Number(total)),
    ),
  );
});

/**
 * Just the product ids the viewer has saved. Every heart in the app reads this
 * one small list (cached once) instead of making a request per card, which is
 * what keeps favourite status out of the N+1 pattern.
 */
favoritesRoute.get("/ids", async (c) => {
  const user = c.get("user")!;
  const rows = await db
    .select({ productId: favorites.productId })
    .from(favorites)
    .where(eq(favorites.userId, user.id));
  return c.json(ok(rows.map((row) => row.productId)));
});

/**
 * Status for a single product. Grids deliberately do NOT call this (that would
 * be one request per card); they derive from `/ids` or the `isFavorited` flag the
 * product responses already carry. Kept for callers that have exactly one product.
 */
favoritesRoute.get("/:productId", async (c) => {
  const user = c.get("user")!;
  const productId = Number(c.req.param("productId"));
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid product id.");
  }
  const [existing] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.userId, user.id), eq(favorites.productId, productId)))
    .limit(1);
  return c.json(ok({ productId, favorited: !!existing }));
});

favoritesRoute.post("/:productId", async (c) => {
  const user = c.get("user")!;
  const productId = Number(c.req.param("productId"));
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid product id.");
  }

  // Only publicly visible listings can be saved.
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), inArray(products.status, [...PUBLIC_PRODUCT_STATUSES])))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const [existing] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.userId, user.id), eq(favorites.productId, productId)))
    .limit(1);
  if (existing) return c.json(ok({ productId, favorited: true }));

  try {
    await db.insert(favorites).values({ userId: user.id, productId });
    await db
      .update(products)
      .set({ favoriteCount: sql`${products.favoriteCount} + 1` })
      .where(eq(products.id, productId));
  } catch (error) {
    // A concurrent double-tap can beat the pre-check; the unique index still wins.
    // Treat the losing insert as success so the client stays idempotent.
    const [raced] = await db
      .select({ id: favorites.id })
      .from(favorites)
      .where(and(eq(favorites.userId, user.id), eq(favorites.productId, productId)))
      .limit(1);
    if (!raced) throw error;
    return c.json(ok({ productId, favorited: true }));
  }

  return c.json(ok({ productId, favorited: true }), 201);
});

/** Removes the relationship only — the product itself is untouched. */
favoritesRoute.delete("/:productId", async (c) => {
  const user = c.get("user")!;
  const productId = Number(c.req.param("productId"));
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid product id.");
  }
  const result = await db
    .delete(favorites)
    .where(and(eq(favorites.userId, user.id), eq(favorites.productId, productId)));
  if (result[0].affectedRows > 0) {
    await db
      .update(products)
      .set({ favoriteCount: sql`GREATEST(${products.favoriteCount} - 1, 0)` })
      .where(eq(products.id, productId));
  }
  return c.json(ok({ productId, favorited: false }));
});

/** Clear the viewer's whole wishlist (never another user's). */
favoritesRoute.delete("/", async (c) => {
  const user = c.get("user")!;
  const rows = await db
    .select({ productId: favorites.productId })
    .from(favorites)
    .where(eq(favorites.userId, user.id));

  if (rows.length) {
    const productIds = rows.map((row) => row.productId);
    await db.transaction(async (tx) => {
      await tx.delete(favorites).where(eq(favorites.userId, user.id));
      await tx
        .update(products)
        .set({ favoriteCount: sql`GREATEST(${products.favoriteCount} - 1, 0)` })
        .where(inArray(products.id, productIds));
    });
  }

  return c.json(ok({ cleared: rows.length }));
});

/* ----------------------------------- cart ---------------------------------- */

/**
 * The cart. Every route below reads the owner from the session — a `userId` is
 * never accepted from a client, and every line query is scoped through that
 * user's own cart row, so a crafted item id cannot reach another cart.
 *
 * Money is computed here from the product as it is *now* (`priceCartLine`);
 * nothing a client sends about price, subtotal or deposit is ever trusted.
 */

cartRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

/**
 * Build the full cart payload: one query for the lines, one for their products,
 * and the totals derived in the database's favour. There is deliberately no
 * per-item request.
 */
async function buildCart(userId: number) {
  const cartId = await getOrCreateCart(userId);

  const rows = await db
    .select({
      id: cartItems.id,
      productId: cartItems.productId,
      mode: cartItems.mode,
      quantity: cartItems.quantity,
      startDate: cartItems.startDate,
      endDate: cartItems.endDate,
      savedForLater: cartItems.savedForLater,
      unitPriceSnapshot: cartItems.unitPriceSnapshot,
      product: { ...cartProductColumns },
    })
    .from(cartItems)
    .leftJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(users, eq(products.sellerId, users.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));

  const items = rows.map((row) => {
    // A left join that found nothing means the product row is gone. The line is
    // kept so the user can see and remove it, rather than vanishing silently.
    const product = row.product && row.product.id !== null ? toCartProduct(row.product) : null;
    const mode = (row.mode === "RENT" ? "RENT" : "BUY") as "BUY" | "RENT";
    const pricing = product
      ? priceCartLine(product, mode, row.quantity, row.startDate, row.endDate)
      : {
          unitPrice: 0,
          lineTotal: 0,
          rentalCharge: 0,
          securityDeposit: 0,
          depositTotal: 0,
          days: 0,
        };

    const issues = validateCartLine({
      product,
      mode,
      quantity: row.quantity,
      startDate: row.startDate,
      endDate: row.endDate,
      snapshotUnitPrice: row.unitPriceSnapshot,
      buyerId: userId,
    });

    return {
      id: row.id,
      productId: row.productId,
      mode,
      listingType: mode,
      quantity: row.quantity,
      startDate: row.startDate ? row.startDate.toISOString() : null,
      endDate: row.endDate ? row.endDate.toISOString() : null,
      /** Rental length in days, or 0 for a purchase. */
      rentalDuration: pricing.days,
      savedForLater: row.savedForLater,
      product,
      pricing,
      issues,
    };
  });

  const active = items.filter((item) => !item.savedForLater);

  // Deposits are tracked apart from the charges and are never seller revenue.
  const totals = {
    subtotal: active.reduce(
      (sum, item) => sum + item.pricing.lineTotal - item.pricing.depositTotal,
      0,
    ),
    rentalCharges: active.reduce((sum, item) => sum + item.pricing.rentalCharge, 0),
    securityDeposits: active.reduce((sum, item) => sum + item.pricing.depositTotal, 0),
    estimatedTotal: active.reduce((sum, item) => sum + item.pricing.lineTotal, 0),
    itemCount: active.length,
    quantityCount: active.reduce((sum, item) => sum + item.quantity, 0),
  };

  return { id: cartId, items, totals };
}

/** Maria2 returns nullable joined columns; normalise them once, here. */
function toCartProduct(row: Record<string, unknown>): CartProduct {
  return {
    ...(row as unknown as CartProduct),
    purchasePrice: (row.purchasePrice ?? null) as number | null,
    rentalPricePerDay: (row.rentalPricePerDay ?? null) as number | null,
    rentalPricePerWeek: (row.rentalPricePerWeek ?? null) as number | null,
    rentalPricePerMonth: (row.rentalPricePerMonth ?? null) as number | null,
    securityDeposit: (row.securityDeposit ?? null) as number | null,
    minimumRentalDays: (row.minimumRentalDays ?? null) as number | null,
    maximumRentalDays: (row.maximumRentalDays ?? null) as number | null,
    primaryImage: (row.primaryImage ?? null) as string | null,
    sellerAvatarUrl: (row.sellerAvatarUrl ?? null) as string | null,
  };
}

cartRoute.get("/", async (c) => {
  const user = c.get("user")!;
  return c.json(ok(await buildCart(user.id)));
});

/**
 * Item count for the navbar badge and the floating dock. Kept as its own tiny
 * endpoint so a badge can refresh without pulling the whole cart.
 */
cartRoute.get("/count", async (c) => {
  const user = c.get("user")!;
  const cartId = await getOrCreateCart(user.id);
  const [{ total }] = await db
    .select({ total: sql<number>`COALESCE(SUM(${cartItems.quantity}), 0)` })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.savedForLater, false)));
  return c.json(ok({ count: Number(total) }));
});

/**
 * Re-check every line against the product as it is now. The cart page calls this
 * before handing over to checkout, so a line that went stale since it was added
 * is caught rather than discovered at order time.
 */
cartRoute.get("/validate", async (c) => {
  const user = c.get("user")!;
  const cart = await buildCart(user.id);
  const blocking = cart.items.filter((item) => !item.savedForLater && item.issues.length > 0);
  return c.json(ok({ valid: blocking.length === 0, items: cart.items, totals: cart.totals }));
});

const addCartItemSchema = z.object({
  productId: z.number().int().positive(),
  /** RENT_AND_BUY is a product capability; the cart mode is always one of these. */
  mode: z.enum(["BUY", "RENT"]),
  quantity: z.number().int().min(1).max(99).default(1),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  savedForLater: z.boolean().default(false),
});

cartRoute.post("/items", async (c) => {
  const user = c.get("user")!;
  const input = addCartItemSchema.parse(await c.req.json());

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  // Adding to the cart is a purchase intent, so `OUT_OF_STOCK` is refused here
  // even though the listing itself is still publicly visible.
  if (!product || !isPurchasable(product.status)) {
    throw new HttpError(404, "NOT_FOUND", "Product not available.");
  }
  if (input.mode === "BUY" && !product.purchasePrice) {
    throw new HttpError(400, "BAD_REQUEST", "This item is not for sale.");
  }
  if (input.mode === "RENT" && !product.rentalPricePerDay) {
    throw new HttpError(400, "BAD_REQUEST", "This item is not for rent.");
  }
  if (input.quantity > product.availableQuantity) {
    throw new HttpError(409, "INSUFFICIENT_QUANTITY", "Not enough units available.");
  }

  const startDate = input.startDate ? new Date(input.startDate) : null;
  const endDate = input.endDate ? new Date(input.endDate) : null;

  if (input.mode === "RENT") {
    // The same engine order creation uses, so the cart can never hold a rental
    // the checkout would reject.
    if (!startDate || !endDate) {
      throw new HttpError(400, "BAD_REQUEST", "Rental dates are required.");
    }
    await assertRentalAvailability(product.id, input.quantity, startDate, endDate);
  }

  const cartId = await getOrCreateCart(user.id);
  // Snapshot the price the user is agreeing to, so a later change is *shown*
  // rather than silently charged.
  const result = await mergeCartItem({
    cartId,
    productId: product.id,
    mode: input.mode,
    quantity: input.quantity,
    startDate: input.mode === "RENT" ? startDate : null,
    endDate: input.mode === "RENT" ? endDate : null,
    savedForLater: input.savedForLater,
    unitPriceSnapshot:
      input.mode === "RENT" ? product.rentalPricePerDay : (product.purchasePrice ?? null),
  });

  return c.json(ok({ ...result, added: true }), result.merged ? 200 : 201);
});

const patchCartItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(99).optional(),
    mode: z.enum(["BUY", "RENT"]).optional(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
    savedForLater: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update." });

cartRoute.patch("/items/:id", async (c) => {
  const user = c.get("user")!;
  const itemId = Number(c.req.param("id"));
  const input = patchCartItemSchema.parse(await c.req.json());

  // Load the line together with its product so the *effective* configuration can
  // be re-checked. A quantity change is as capable of becoming invalid as a mode
  // change, so every patch goes through the same rules an add does — there is no
  // "it was valid when it was added" exemption.
  const [row] = await db
    .select({
      line: cartItems,
      product: {
        id: products.id,
        status: products.status,
        availableQuantity: products.availableQuantity,
        purchasePrice: products.purchasePrice,
        rentalPricePerDay: products.rentalPricePerDay,
      },
    })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .leftJoin(products, eq(cartItems.productId, products.id))
    .where(and(eq(cartItems.id, itemId), eq(carts.userId, user.id)))
    .limit(1);

  if (!row) throw new HttpError(404, "NOT_FOUND", "That item is not in your cart.");

  const line = row.line;
  const product = row.product;
  if (!product || !isPurchasable(product.status)) {
    throw new HttpError(409, "UNAVAILABLE", "This item is no longer available.");
  }

  const mode = (input.mode ?? (line.mode as "BUY" | "RENT")) as "BUY" | "RENT";
  const quantity = input.quantity ?? line.quantity;

  if (mode === "BUY" && !product.purchasePrice) {
    throw new HttpError(400, "BAD_REQUEST", "This item is not for sale.");
  }
  if (mode === "RENT" && !product.rentalPricePerDay) {
    throw new HttpError(400, "BAD_REQUEST", "This item is not for rent.");
  }

  if (mode === "RENT") {
    const start =
      input.startDate === undefined
        ? line.startDate
        : input.startDate
          ? new Date(input.startDate)
          : null;
    const end =
      input.endDate === undefined ? line.endDate : input.endDate ? new Date(input.endDate) : null;

    if (start && end) {
      // The authoritative check: min/max duration, past dates and whether the
      // window is free — the same engine order creation uses.
      await assertRentalAvailability(line.productId, quantity, start, end);
    } else if (quantity > product.availableQuantity) {
      throw new HttpError(409, "INSUFFICIENT_QUANTITY", "Not enough units available.");
    }
  } else if (quantity > product.availableQuantity) {
    throw new HttpError(409, "INSUFFICIENT_QUANTITY", "Not enough units available.");
  }

  // A mode switch makes this a different configuration, so re-snapshot the price
  // the user is now agreeing to; otherwise an old snapshot would look like a
  // price change the moment the mode changed.
  if (input.mode !== undefined && input.mode !== line.mode) {
    await db
      .update(cartItems)
      .set({
        unitPriceSnapshot:
          mode === "RENT" ? product.rentalPricePerDay : (product.purchasePrice ?? null),
      })
      .where(eq(cartItems.id, itemId));
  }

  const result = await updateCartItem(user.id, itemId, {
    quantity: input.quantity,
    mode: input.mode,
    startDate:
      input.startDate === undefined
        ? undefined
        : input.startDate
          ? new Date(input.startDate)
          : undefined,
    endDate:
      input.endDate === undefined ? undefined : input.endDate ? new Date(input.endDate) : undefined,
  });

  if (input.savedForLater !== undefined) {
    const cartId = await getOrCreateCart(user.id);
    await db
      .update(cartItems)
      .set({ savedForLater: input.savedForLater, updatedAt: new Date() })
      .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
  }

  return c.json(ok({ ...result, updated: true }));
});

cartRoute.delete("/items/:id", async (c) => {
  const user = c.get("user")!;
  const itemId = Number(c.req.param("id"));
  await removeCartItem(user.id, itemId);
  return c.json(ok({ removed: true }));
});

/** Empty the whole cart. */
cartRoute.delete("/", async (c) => {
  const user = c.get("user")!;
  const cleared = await clearCart(user.id);
  return c.json(ok({ cleared }));
});

/* -------------------------------- addresses -------------------------------- */

const addressSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(20),
  addressLine1: z.string().trim().min(4).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(4).max(20),
  country: z.string().trim().max(80).default("India"),
  isDefault: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;

addressesRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

addressesRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const rows = await db.select().from(addresses).where(eq(addresses.userId, user.id));
  return c.json(ok(rows));
});

addressesRoute.post("/", async (c) => {
  const user = c.get("user")!;
  const input = addressSchema.parse(await c.req.json());
  if (input.isDefault) {
    await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
  }
  const [created] = await db.insert(addresses).values({ ...input, userId: user.id });
  return c.json(ok(created), 201);
});

addressesRoute.patch("/:id", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const input = addressSchema.partial().parse(await c.req.json());
  if (input.isDefault) {
    await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
  }
  const [updated] = await db
    .update(addresses)
    .set(input)
    .where(and(eq(addresses.id, id), eq(addresses.userId, user.id)));
  if (!updated) throw new HttpError(404, "NOT_FOUND", "Address not found.");
  return c.json(ok(updated));
});

addressesRoute.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, user.id)));
  return c.json(ok({ deleted: true }));
});
