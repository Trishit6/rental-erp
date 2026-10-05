import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { orderItems, products } from "../schema";
import { HttpError } from "./api";
import { PRODUCT_STATUSES } from "./product-status";
import { assertProductPricing } from "./product-validation";

/**
 * Admin write paths for the catalogue.
 *
 * ## Why these live apart from `routes/admin.ts`
 *
 * `admin-products.ts` owns *reading* the catalogue (the paged list and its facets).
 * This module owns the three mutations an administrator performs on a listing —
 * edit, delete, bulk-status — and each one has a rule that is worth stating once,
 * in one place, rather than inline in a route handler:
 *
 *  1. **The merged row is what gets validated.** `productInputSchema.partial()`
 *     cannot express "a rental listing needs a rental price", because a partial
 *     edit of `{ listingType: "RENT" }` carries no prices. So the stored row is
 *     loaded, the patch is merged onto it, and `assertProductPricing` judges the
 *     result — the only shape in which that rule is a true statement. This is the
 *     same reason `lib/product-validation.ts` is not part of the Zod schema.
 *
 *  2. **Deletion is archive-or-delete, decided by the database, not the caller.**
 *     `order_items.product_id` is `ON DELETE RESTRICT`, so a listing that has
 *     ever been ordered cannot be hard-deleted without destroying the history that
 *     proves it was. Rather than let that surface as a raw SQL error (or worse,
 *     force the admin to remove the order first), an ordered listing is archived:
 *     the row, its images and its reviews survive, and it simply leaves the
 *     storefront. An unordered listing is removed outright, in a transaction.
 *
 *  3. **Nothing here trusts the request for identity.** The seller is read from
 *     the product row; no `sellerId`, `slug` or `createdAt` from the body is ever
 *     written. The slug is stable, because historical order items and notifications
 *     deep-link by it.
 */

/**
 * The fields an administrator may change.
 *
 * Mirrors `productInputSchema` (`routes/products.ts`) minus everything that is the
 * seller's alone — `brand`, `location`, coordinates, `rentToOwn*`, `tags`,
 * `images` and `condition` are *not* here. An admin moderating a marketplace can
 * correct what is wrong and remove what is not permitted; rewriting a seller's
 * description wholesale is not moderation, and the seller edit route already does
 * it properly.
 *
 * `.partial()` throughout, so a patch that touches one field is a one-field patch.
 * Every field is `null`-able where the column is: "clear the rental price" has to
 * be expressible, and `undefined` already means "leave alone".
 */
export const adminProductEditSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(5000),
    categoryId: z.number().int().positive(),
    listingType: z.enum(["SALE", "RENT", "BOTH"]),
    purchasePrice: z.number().int().min(0).max(10_000_000).nullable(),
    rentalPricePerDay: z.number().int().min(0).max(1_000_000).nullable(),
    rentalPricePerWeek: z.number().int().min(0).max(1_000_000).nullable(),
    rentalPricePerMonth: z.number().int().min(0).max(1_000_000).nullable(),
    securityDeposit: z.number().int().min(0).max(1_000_000).nullable(),
    minimumRentalDays: z.number().int().min(1).max(90).nullable(),
    maximumRentalDays: z.number().int().min(1).max(365).nullable(),
    /**
     * Total stock. Available stock is clamped rather than trusted: it is the
     * number order creation decrements, so allowing a client to raise it above
     * `quantity` would let the catalogue promise stock it does not hold.
     */
    quantity: z.number().int().min(1).max(999),
    availableQuantity: z.number().int().min(0).max(999),
    status: z.enum(PRODUCT_STATUSES),
    allowsDelivery: z.boolean(),
    allowsPickup: z.boolean(),
  })
  .partial()
  // "Nothing to update" is a client bug, not a no-op to accept silently.
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update." });

export type AdminProductEdit = z.infer<typeof adminProductEditSchema>;

/** Fields written by an edit, in the order they are named in the schema. */
const EDITABLE_COLUMNS = [
  "title",
  "description",
  "categoryId",
  "listingType",
  "purchasePrice",
  "rentalPricePerDay",
  "rentalPricePerWeek",
  "rentalPricePerMonth",
  "securityDeposit",
  "minimumRentalDays",
  "maximumRentalDays",
  "quantity",
  "availableQuantity",
  "status",
  "allowsDelivery",
  "allowsPickup",
] as const satisfies readonly (keyof AdminProductEdit)[];

/** The `status` column, restricted back to the real vocabulary. */
export type AdminProductUpdateResult = {
  id: number;
  /** Human-readable field names, for the audit entry and the success toast. */
  changed: string[];
};

/**
 * Apply an administrator's patch to one listing.
 *
 * Loads the row first so the cross-field rules run against the merged result, and
 * so `availableQuantity` can be clamped against the *new* total rather than the
 * old one (lowering `quantity` below what is still available would otherwise leave
 * the listing claiming stock it does not have).
 */
export async function updateAdminProduct(
  id: number,
  patch: AdminProductEdit,
): Promise<AdminProductUpdateResult> {
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  // An empty patch is a no-op, not an error: the catalogue's row actions can fire
  // a save with nothing changed (an opened-then-closed dialog). Returning `unchanged`
  // lets the caller skip its toast rather than reporting a change that did not happen.
  const changed = Object.keys(patch).filter(
    (key) => key in patch && patch[key as keyof AdminProductEdit] !== undefined,
  );
  if (changed.length === 0) return { id, changed: [] };

  const status = patch.status ?? existing.status;

  const merged = {
    listingType: patch.listingType ?? existing.listingType,
    purchasePrice: patch.purchasePrice !== undefined ? patch.purchasePrice : existing.purchasePrice,
    rentalPricePerDay:
      patch.rentalPricePerDay !== undefined ? patch.rentalPricePerDay : existing.rentalPricePerDay,
    rentalPricePerWeek:
      patch.rentalPricePerWeek !== undefined ? patch.rentalPricePerWeek : existing.rentalPricePerWeek,
    rentalPricePerMonth:
      patch.rentalPricePerMonth !== undefined
        ? patch.rentalPricePerMonth
        : existing.rentalPricePerMonth,
    securityDeposit:
      patch.securityDeposit !== undefined ? patch.securityDeposit : existing.securityDeposit,
    minimumRentalDays:
      patch.minimumRentalDays !== undefined
        ? patch.minimumRentalDays
        : existing.minimumRentalDays,
    maximumRentalDays:
      patch.maximumRentalDays !== undefined
        ? patch.maximumRentalDays
        : existing.maximumRentalDays,
    quantity: patch.quantity ?? existing.quantity,
    availableQuantity:
      patch.availableQuantity !== undefined
        ? patch.availableQuantity
        : existing.availableQuantity,
  };

  // Available stock can never exceed total stock. Clamping rather than rejecting
  // keeps a legitimate correction ("stock is actually 4, not 9") from failing on a
  // number the admin can see and fix.
  merged.availableQuantity = Math.min(merged.availableQuantity, merged.quantity);

  assertProductPricing(merged);

  const values: Partial<typeof products.$inferInsert> = {
    ...merged,
    status,
    updatedAt: new Date(),
  };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId;
  if (patch.allowsDelivery !== undefined) values.allowsDelivery = patch.allowsDelivery;
  if (patch.allowsPickup !== undefined) values.allowsPickup = patch.allowsPickup;

  await db.update(products).set(values).where(eq(products.id, id));

  return { id, changed: changed.filter((key) => (EDITABLE_COLUMNS as readonly string[]).includes(key)) };
}

export type AdminProductDeleteResult = {
  id: number;
  outcome: "deleted" | "archived";
  /**
   * Why an archive happened instead of a delete, phrased for the person who
   * pressed the button. Empty when the row was genuinely removed.
   */
  reason: string;
  /** How many order lines still reference the listing. Drives the confirmation copy. */
  orderCount: number;
};

/**
 * Remove a listing, or archive it when history forbids a delete.
 *
 * The decision is made by asking the database, not by trusting a flag from the
 * dialog: `order_items` is the table that must keep working, and a listing with
 * lines in it is exactly the case where a hard delete would either fail on the
 * foreign key or force the removal of somebody's receipt.
 *
 * Both branches run in a transaction, so a failure to clear a dependent row cannot
 * leave a listing that is neither deleted nor archived.
 */
export async function deleteAdminProduct(
  id: number,
  opts: { force?: boolean } = {},
): Promise<AdminProductDeleteResult> {
  const [existing] = await db
    .select({ id: products.id, title: products.title, status: products.status })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const [{ total }] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(orderItems)
    .where(eq(orderItems.productId, id));
  const orderCount = Number(total);

  // History wins. `force` exists for the one case where the admin has been told
  // what will happen and has asked for it anyway — it still cannot delete an
  // ordered listing, because that would destroy an order line; it only skips the
  // archive and lets the request fail loudly rather than silently doing something
  // other than what was asked.
  if (orderCount > 0) {
    if (opts.force) {
      throw new HttpError(
        409,
        "PRODUCT_IN_USE",
        "This listing has order history and cannot be deleted. Archive it instead.",
      );
    }
    if (existing.status !== "ARCHIVED") {
      await db
        .update(products)
        .set({ status: "ARCHIVED", updatedAt: new Date() })
        .where(eq(products.id, id));
    }
    return {
      id,
      outcome: "archived",
      reason:
        `This listing appears on ${orderCount} order line${orderCount === 1 ? "" : "s"}, ` +
        "so it was archived instead of deleted. Its history stays intact and it is no longer visible in the marketplace.",
      orderCount,
    };
  }

  // Never ordered: the row and every dependent row go together. Images, tags,
  // favourites and cart lines all cascade; this transaction exists so a partial
  // cleanup cannot survive.
  await db.transaction(async (tx) => {
    await tx.delete(products).where(eq(products.id, id));
  });

  return { id, outcome: "deleted", reason: "", orderCount };
}

/**
 * The status changes a bulk action may apply.
 *
 * Deliberately not the full `PRODUCT_STATUSES` vocabulary: `SOLD` is not a state
 * this codebase writes through the catalogue (see the note on the single-status
 * route), and a bulk action should not be able to put fifty listings into a
 * status no other admin surface can.
 */
export const BULK_PRODUCT_STATUSES = ["PUBLISHED", "PAUSED", "ARCHIVED"] as const;
export type BulkProductStatus = (typeof BULK_PRODUCT_STATUSES)[number];

export type AdminBulkStatusResult = {
  requested: number;
  updated: number;
  /** Ids that do not exist. Surfaced so the toast can be honest about a short write. */
  missing: number[];
  status: BulkProductStatus;
};

/**
 * Set one status on many listings.
 *
 * Ids are resolved to real rows *before* the update, so the reported `updated`
 * count is the number of rows that actually changed rather than the number
 * submitted. Ids that do not exist are returned as `missing` instead of being
 * silently dropped — a stale table selection is a thing the admin should be told
 * about.
 */
export async function bulkSetAdminProductStatus(
  ids: number[],
  status: BulkProductStatus,
): Promise<AdminBulkStatusResult> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) throw new HttpError(400, "BAD_REQUEST", "No products selected.");

  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, unique));
  const present = existing.map((row) => row.id);
  const presentSet = new Set(present);
  const missing = unique.filter((id) => !presentSet.has(id));

  if (present.length > 0) {
    await db
      .update(products)
      .set({ status, updatedAt: new Date() })
      .where(inArray(products.id, present));
  }

  return { requested: unique.length, updated: present.length, missing, status };
}
