import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { cartItems, carts, products, users } from "../schema";
import { HttpError } from "./api";
import { isPurchasable } from "./product-status";
import { effectiveDailyRate, quoteRental, rentalDays } from "../../src/lib/pricing";

/**
 * The cart engine.
 *
 * Three rules the rest of the app leans on:
 *
 *  1. **The server owns pricing.** Nothing the client sends about money is
 *     trusted — `unitPrice`, `subtotal`, `deposit` are always recomputed from
 *     the product row. The stored `unitPriceSnapshot` is *not* a price source;
 *     it exists only so the cart can say "this went from ₹499 to ₹549" instead
 *     of silently charging a different amount than the user agreed to.
 *  2. **The server owns availability and validity.** Mode, quantity and rental
 *     window are re-checked on every write against the product as it is *now*.
 *  3. **Ownership comes from the session.** Every helper takes a `userId` that
 *     the route read from the session; a cart is never addressed by a client
 *     supplied id alone.
 */

/* ------------------------------ configuration ------------------------------ */

/** The product fields a cart line needs. One join, no per-item request. */
export const cartProductColumns = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  location: products.location,
  condition: products.condition,
  listingType: products.listingType,
  status: products.status,
  categoryId: products.categoryId,
  purchasePrice: products.purchasePrice,
  rentalPricePerDay: products.rentalPricePerDay,
  rentalPricePerWeek: products.rentalPricePerWeek,
  rentalPricePerMonth: products.rentalPricePerMonth,
  securityDeposit: products.securityDeposit,
  minimumRentalDays: products.minimumRentalDays,
  maximumRentalDays: products.maximumRentalDays,
  quantity: products.quantity,
  availableQuantity: products.availableQuantity,
  sellerId: products.sellerId,
  primaryImage: sql<string | null>`(
    SELECT pi.url FROM product_images pi
    WHERE pi.product_id = ${products.id}
    ORDER BY pi.sort_order ASC LIMIT 1
  )`,
  sellerName: users.name,
  sellerAvatarUrl: users.avatarUrl,
  sellerVerified: users.verified,
};

export type CartProduct = {
  id: number;
  slug: string;
  title: string;
  location: string;
  condition: string;
  listingType: string;
  status: string;
  categoryId: number;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  quantity: number;
  availableQuantity: number;
  sellerId: number;
  primaryImage: string | null;
  sellerName: string;
  sellerAvatarUrl: string | null;
  sellerVerified: boolean;
};

/* --------------------------------- pricing --------------------------------- */

export type CartLinePricing = {
  /** paise per unit for the chosen mode (sale price, or the effective daily rate). */
  unitPrice: number;
  /** `unitPrice × quantity` for a purchase; `unitPrice × days × quantity` for a rental. */
  lineTotal: number;
  /** The rental part of `lineTotal`. Zero for a purchase. */
  rentalCharge: number;
  /** Refundable deposit per unit. Zero for a purchase. */
  securityDeposit: number;
  /** `securityDeposit × quantity`, for rentals only. */
  depositTotal: number;
  /** Rental length in days. Zero for a purchase. */
  days: number;
};

/**
 * Price one line from the product as it is *right now*. Every amount is integer
 * paise and the deposit is always reported separately from the charge — a
 * deposit is not seller revenue and must never be folded into a subtotal.
 */
export function priceCartLine(
  product: {
    purchasePrice: number | null;
    rentalPricePerDay: number | null;
    rentalPricePerWeek: number | null;
    rentalPricePerMonth: number | null;
    securityDeposit: number | null;
  },
  mode: "BUY" | "RENT",
  quantity: number,
  startDate?: Date | null,
  endDate?: Date | null,
): CartLinePricing {
  const qty = Math.max(1, Math.floor(quantity));

  if (mode === "RENT" && startDate && endDate) {
    const quote = quoteRental(
      {
        rentalPricePerDay: product.rentalPricePerDay,
        rentalPricePerWeek: product.rentalPricePerWeek,
        rentalPricePerMonth: product.rentalPricePerMonth,
        securityDeposit: product.securityDeposit,
      },
      { startDate, endDate },
    );
    const rentalCharge = quote.rentalSubtotal * qty;
    const depositPerUnit = quote.securityDeposit;
    return {
      unitPrice: quote.dailyRate,
      lineTotal: rentalCharge + depositPerUnit * qty,
      rentalCharge,
      securityDeposit: depositPerUnit,
      depositTotal: depositPerUnit * qty,
      days: quote.days,
    };
  }

  const unitPrice = product.purchasePrice ?? 0;
  return {
    unitPrice,
    lineTotal: unitPrice * qty,
    rentalCharge: 0,
    securityDeposit: 0,
    depositTotal: 0,
    days: 0,
  };
}

/** The daily rate a rental would actually be charged, honouring week/month tiers. */
export function effectiveRentalRate(product: CartProduct, days: number): number {
  return effectiveDailyRate(
    {
      rentalPricePerDay: product.rentalPricePerDay,
      rentalPricePerWeek: product.rentalPricePerWeek,
      rentalPricePerMonth: product.rentalPricePerMonth,
      securityDeposit: product.securityDeposit,
    },
    days,
  );
}

/* ------------------------------- validation -------------------------------- */

export type CartIssueCode =
  | "PRODUCT_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "QUANTITY_UNAVAILABLE"
  | "RENTAL_UNAVAILABLE"
  | "MODE_UNSUPPORTED"
  | "OWN_LISTING";

export type CartIssue = {
  code: CartIssueCode;
  message: string;
  /** Which control the user must act on, when it is one. */
  field?: "quantity" | "listingType" | "rentalDuration" | "price";
  /** Shown only for a price change: what it used to be. */
  previousValue?: string;
  /** Shown only for a price change: what it is now. */
  currentValue?: string;
};

const money = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/**
 * Everything that could stop this line from being ordered, computed against the
 * product's *current* state. Returns an empty array when the line is good.
 *
 * This is the function behind both the always-on `issues` on each line and
 * `POST /api/cart/validate`, so the page and the checkout gate can never
 * disagree about what is wrong.
 */
/**
 * The product fields validation actually reads.
 *
 * Deliberately narrower than `CartProduct`. Validation is also run by checkout
 * and order creation, which hold a leaner projection; without this they would
 * have to fabricate a dozen fields they never read, and a fabricated
 * `status: "PUBLISHED"` would quietly disable the very check being called.
 */
export type ValidatableProduct = {
  status: string;
  sellerId: number;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  availableQuantity: number;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
};

export function validateCartLine(input: {
  product: ValidatableProduct | null;
  mode: "BUY" | "RENT";
  quantity: number;
  startDate: Date | null;
  endDate: Date | null;
  snapshotUnitPrice: number | null;
  buyerId?: number;
}): CartIssue[] {
  const { product, mode, quantity, startDate, endDate, snapshotUnitPrice, buyerId } = input;
  const issues: CartIssue[] = [];

  // A deleted product: keep the line visible so the user can remove it.
  if (!product) {
    issues.push({
      code: "PRODUCT_UNAVAILABLE",
      message: "This product is no longer available.",
      field: "listingType",
    });
    return issues;
  }

  // `isPurchasable`, not `isPubliclyVisible`: an `OUT_OF_STOCK` listing is still
  // browsable and favouritable, but nothing about it may be bought.
  if (!isPurchasable(product.status)) {
    issues.push({
      code: "PRODUCT_UNAVAILABLE",
      message: "This listing is no longer available.",
      field: "listingType",
    });
  }

  if (buyerId !== undefined && product.sellerId === buyerId) {
    issues.push({ code: "OWN_LISTING", message: "This is your own listing." });
  }

  if (mode === "BUY" && !product.purchasePrice) {
    issues.push({
      code: "MODE_UNSUPPORTED",
      message: "This item is no longer for sale.",
      field: "listingType",
    });
  }
  if (mode === "RENT" && !product.rentalPricePerDay) {
    issues.push({
      code: "MODE_UNSUPPORTED",
      message: "This item is no longer available to rent.",
      field: "listingType",
    });
  }

  if (product.availableQuantity <= 0) {
    issues.push({
      code: "QUANTITY_UNAVAILABLE",
      message: "This item is out of stock.",
      field: "quantity",
    });
  } else if (quantity > product.availableQuantity) {
    issues.push({
      code: "QUANTITY_UNAVAILABLE",
      message: `Only ${product.availableQuantity} left.`,
      field: "quantity",
    });
  }

  if (mode === "RENT" && product.rentalPricePerDay) {
    if (!startDate || !endDate) {
      issues.push({
        code: "RENTAL_UNAVAILABLE",
        message: "Choose rental dates for this item.",
        field: "rentalDuration",
      });
    } else {
      const days = rentalDays({ startDate, endDate });
      if (product.minimumRentalDays && days < product.minimumRentalDays) {
        issues.push({
          code: "RENTAL_UNAVAILABLE",
          message: `The minimum rental for this item is ${product.minimumRentalDays} days.`,
          field: "rentalDuration",
        });
      }
      if (product.maximumRentalDays && days > product.maximumRentalDays) {
        issues.push({
          code: "RENTAL_UNAVAILABLE",
          message: `The maximum rental for this item is ${product.maximumRentalDays} days.`,
          field: "rentalDuration",
        });
      }
    }
  }

  // Price drift. Only meaningful once a snapshot exists, and only for a purchase
  // or a rental whose rate can be compared.
  if (snapshotUnitPrice !== null && mode === "BUY" && product.purchasePrice) {
    if (product.purchasePrice !== snapshotUnitPrice) {
      issues.push({
        code: "PRICE_CHANGED",
        message: "The price of this item has changed.",
        field: "price",
        previousValue: money(snapshotUnitPrice),
        currentValue: money(product.purchasePrice),
      });
    }
  }
  if (snapshotUnitPrice !== null && mode === "RENT" && product.rentalPricePerDay) {
    if (product.rentalPricePerDay !== snapshotUnitPrice) {
      issues.push({
        code: "PRICE_CHANGED",
        message: "The rental price for this product has changed.",
        field: "price",
        previousValue: `${money(snapshotUnitPrice)}/day`,
        currentValue: `${money(product.rentalPricePerDay)}/day`,
      });
    }
  }

  return issues;
}

/* --------------------------------- writes ---------------------------------- */

/** The signed-in user's cart, created on first use. Ownership is never a param. */
export async function getOrCreateCart(userId: number): Promise<number> {
  const [existing] = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(carts).values({ userId }).$returningId();
  return Number(created.id);
}

export type CartWriteResult = { itemId: number; quantity: number; merged: boolean };

/**
 * Add a configuration to the cart, merging into an identical existing line
 * instead of creating a duplicate.
 *
 * "Identical" means same product, same mode and same rental window: a second
 * 7-day rental of the same product is quantity 2, while a 30-day rental is a
 * genuinely different configuration and gets its own row. A purchase and a
 * rental of the same product are likewise two separate lines.
 *
 * The cart row is locked `for update` so two rapid clicks cannot both decide to
 * insert. This is the only place that decides what "a duplicate" is.
 */
type CartLineLike = typeof cartItems.$inferSelect;

type MergeTarget = {
  productId: number;
  mode: string;
  quantity: number;
  startDate: Date | null;
  endDate: Date | null;
  savedForLater: boolean;
  unitPriceSnapshot: number | null;
};

/** `yyyy-mm-dd`, because the column stores a date and the driver hands back a Date. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * **What counts as "the same cart line".**
 *
 * Same product + same mode + same rental window + same saved-for-later state.
 * That means a second 7-day rental merges into quantity 2, while a 30-day rental
 * is a genuinely different configuration and gets its own row. A purchase and a
 * rental of the same product are two separate lines too.
 *
 * Dates compare by day only: the column has day precision, so comparing the full
 * timestamp would make an identical window look different and duplicate the row.
 *
 * One definition, used by both the add path and the mode-switch path, so the two
 * can never disagree about what merges.
 */
function isSameConfiguration(line: CartLineLike, target: MergeTarget): boolean {
  if (
    line.productId !== target.productId ||
    line.mode !== target.mode ||
    line.savedForLater !== target.savedForLater
  ) {
    return false;
  }

  const sameDay = (a: Date | null, b: Date | null) =>
    a === null ? b === null : b !== null && dateOnly(a) === dateOnly(b);

  return sameDay(line.startDate, target.startDate) && sameDay(line.endDate, target.endDate);
}

/**
 * Add a configuration to the cart, merging into an identical existing line
 * instead of creating a duplicate.
 *
 * The cart row is locked `for update` so two rapid clicks cannot both decide to
 * insert. This function and {@link isSameConfiguration} are the only place that
 * decides what "a duplicate" is.
 */
export async function mergeCartItem(input: MergeTarget & { cartId: number }): Promise<CartWriteResult> {
  const quantity = Math.max(1, Math.floor(input.quantity));
  const { cartId, ...target } = input;

  return db.transaction(async (tx) => {
    // Serialise concurrent adds for this cart.
    await tx.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).for("update");

    const existing = await tx.select().from(cartItems).where(eq(cartItems.cartId, cartId));
    const match = existing.find((line) => isSameConfiguration(line, { ...target, quantity }));

    if (match) {
      const nextQuantity = match.quantity + quantity;
      await tx
        .update(cartItems)
        .set({ quantity: nextQuantity, updatedAt: new Date() })
        .where(eq(cartItems.id, match.id));
      await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
      return { itemId: match.id, quantity: nextQuantity, merged: true };
    }

    const [created] = await tx
      .insert(cartItems)
      .values({ cartId, ...target, quantity })
      .$returningId();

    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
    return { itemId: Number(created.id), quantity, merged: false };
  });
}

/**
 * Apply a patch to one line. Ownership is enforced by scoping on the user's own
 * cart, so a crafted item id from another user simply matches nothing.
 */
export async function updateCartItem(
  userId: number,
  itemId: number,
  patch: { quantity?: number; mode?: "BUY" | "RENT"; startDate?: Date; endDate?: Date },
): Promise<CartWriteResult> {
  const cartId = await getOrCreateCart(userId);

  const [item] = await db
    .select({ line: cartItems })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .where(and(eq(cartItems.id, itemId), eq(carts.userId, userId)))
    .limit(1);

  if (!item) throw new HttpError(404, "NOT_FOUND", "That item is not in your cart.");
  const line = item.line;

  return db.transaction(async (tx) => {
    const next: Partial<typeof cartItems.$inferInsert> = { updatedAt: new Date() };

    if (patch.quantity !== undefined) {
      next.quantity = Math.max(1, Math.floor(patch.quantity));
    }
    if (patch.startDate !== undefined) next.startDate = patch.startDate;
    if (patch.endDate !== undefined) next.endDate = patch.endDate;

    // A mode switch makes this a different configuration, so merge it with an
    // identical line if one exists rather than creating a second copy.
    const nextMode = patch.mode ?? (line.mode as "BUY" | "RENT");
    const nextStart = patch.startDate !== undefined ? patch.startDate : line.startDate;
    const nextEnd = patch.endDate !== undefined ? patch.endDate : line.endDate;

    if (patch.mode !== undefined && patch.mode !== line.mode) {
      await tx.delete(cartItems).where(eq(cartItems.id, itemId));
      const merged = await mergeInTransaction(tx, cartId, {
        productId: line.productId,
        mode: nextMode,
        quantity: patch.quantity ?? line.quantity,
        startDate: nextMode === "RENT" ? nextStart : null,
        endDate: nextMode === "RENT" ? nextEnd : null,
        savedForLater: line.savedForLater,
        unitPriceSnapshot: line.unitPriceSnapshot,
      });
      await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
      return merged;
    }

    await tx.update(cartItems).set(next).where(eq(cartItems.id, itemId));
    await tx.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
    return { itemId, quantity: next.quantity ?? line.quantity, merged: false };
  });
}

/** Merge inside a caller's transaction (used when a mode switch re-adds a line). */
async function mergeInTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  cartId: number,
  target: MergeTarget,
): Promise<CartWriteResult> {
  const quantity = Math.max(1, Math.floor(target.quantity));
  const existing = await tx.select().from(cartItems).where(eq(cartItems.cartId, cartId));
  const match = existing.find((line) => isSameConfiguration(line, { ...target, quantity }));

  if (match) {
    const nextQuantity = match.quantity + quantity;
    await tx
      .update(cartItems)
      .set({ quantity: nextQuantity, updatedAt: new Date() })
      .where(eq(cartItems.id, match.id));
    return { itemId: match.id, quantity: nextQuantity, merged: true };
  }

  const [created] = await tx
    .insert(cartItems)
    .values({ cartId, ...target, quantity })
    .$returningId();
  return { itemId: Number(created.id), quantity, merged: false };
}

/** Remove one line. Scoped to the user's own cart. */
export async function removeCartItem(userId: number, itemId: number): Promise<void> {
  const cartId = await getOrCreateCart(userId);
  await db
    .delete(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)));
}

/** Empty the cart. */
export async function clearCart(userId: number): Promise<number> {
  const cartId = await getOrCreateCart(userId);
  const result = await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  return result[0].affectedRows;
}
