import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { products, rentals, users } from "../schema";

/**
 * Seller alerts (PROMPT 21).
 *
 * ## Two questions a seller asks about stock they cannot see
 *
 * A seller's two most expensive misses are invisible in a list of six thousand
 * listings: a *published* item that has run down to its last unit or two, and a
 * rental that is due back within a day or two. Neither is an error, so nothing
 * throws; both cost money if nobody notices. This module answers exactly those
 * two questions, from the same tables the rest of the seller workspace reads —
 * no counter table, no denormalised "alert" row, nothing that can drift from the
 * inventory it describes.
 *
 * ## Why the thresholds live here and not in the query
 *
 * `LOW_STOCK_THRESHOLD` and `RETURNING_SOON_DAYS` are the definition of the
 * feature, so they are named constants with pure predicates beside them
 * (`isLowStock`, `isReturningSoon`). The SQL below and the pure helpers share
 * the constant, and `tests/seller-alerts.test.ts` pins the boundary behaviour
 * without a database. A literal `<= 2` written twice is how the list and the
 * count come to disagree.
 */

/** At or below this many available units, a live listing is "running low". */
export const LOW_STOCK_THRESHOLD = 2;

/** A rental ending within this many days (or already past) is "returning soon". */
export const RETURNING_SOON_DAYS = 3;

/** One alert list is a nudge, not a ledger — a handful of the most urgent. */
export const ALERTS_LIMIT = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses a seller is actively running and therefore cares about stock on. */
const LIVE_LISTING_STATUSES = ["PUBLISHED", "OUT_OF_STOCK"] as const;

/**
 * Rental states that still owe the seller an item back.
 *
 * `RETURN_PENDING` is deliberately absent: the renter has already asked to hand
 * it over, so it is in motion rather than at risk of being forgotten. `CONFIRMED`
 * is present because a short booking can start and end inside the window.
 */
const OUTSTANDING_RENTAL_STATUSES = ["CONFIRMED", "ACTIVE", "OVERDUE"] as const;

/** Whether a live listing has run down to (or below) the low-stock line. */
export function isLowStock(
  availableQuantity: number,
  threshold: number = LOW_STOCK_THRESHOLD,
): boolean {
  return availableQuantity <= threshold;
}

/**
 * Whole days until a date, rounded up, so "due tomorrow" reads as `1` and a date
 * already past the current moment is negative.
 */
export function daysUntil(date: Date | string, now: Date = new Date()): number {
  const then = typeof date === "string" ? new Date(date) : date;
  return Math.ceil((then.getTime() - now.getTime()) / DAY_MS);
}

/** Whether a rental is due back within the window (overdue counts — it is urgent). */
export function isReturningSoon(
  endDate: Date | string,
  now: Date = new Date(),
  days: number = RETURNING_SOON_DAYS,
): boolean {
  return daysUntil(endDate, now) <= days;
}

export type LowStockAlert = {
  id: number;
  title: string;
  slug: string;
  imageUrl: string | null;
  availableQuantity: number;
  quantity: number;
  status: string;
};

export type ReturningSoonAlert = {
  id: number;
  productId: number;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  renterName: string | null;
  status: string;
  endDate: string;
  /** Negative when the rental is already overdue. */
  daysUntilDue: number;
};

export type SellerAlerts = {
  lowStock: LowStockAlert[];
  returningSoon: ReturningSoonAlert[];
};

/**
 * The two alert lists for one seller, each capped and ordered most-urgent-first.
 *
 * Scoped by `seller_id` / `owner_id` in the WHERE clause, exactly like every
 * other seller read: the caller's identity comes from the session and is put
 * next to the predicate, so another seller's stock is not merely hidden, it is
 * never selected.
 */
export async function getSellerAlerts(sellerId: number): Promise<SellerAlerts> {
  const soonCutoff = new Date(Date.now() + RETURNING_SOON_DAYS * DAY_MS);

  const [lowStockRows, rentalRows] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        imageUrl: sql<string | null>`(
          SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id}
          ORDER BY pi.sort_order ASC LIMIT 1
        )`,
        availableQuantity: products.availableQuantity,
        quantity: products.quantity,
        status: products.status,
      })
      .from(products)
      .where(
        and(
          eq(products.sellerId, sellerId),
          inArray(products.status, [...LIVE_LISTING_STATUSES]),
          lte(products.availableQuantity, LOW_STOCK_THRESHOLD),
        ),
      )
      // Empty first (most urgent), then the oldest touched, so a long-stale row
      // surfaces ahead of one that just dipped.
      .orderBy(asc(products.availableQuantity), asc(products.updatedAt))
      .limit(ALERTS_LIMIT),
    db
      .select({
        id: rentals.id,
        productId: rentals.productId,
        title: products.title,
        slug: products.slug,
        imageUrl: sql<string | null>`(
          SELECT pi.url FROM product_images pi WHERE pi.product_id = ${products.id}
          ORDER BY pi.sort_order ASC LIMIT 1
        )`,
        renterName: users.name,
        status: rentals.status,
        endDate: rentals.endDate,
      })
      .from(rentals)
      .innerJoin(products, eq(products.id, rentals.productId))
      .leftJoin(users, eq(users.id, rentals.renterId))
      .where(
        and(
          eq(rentals.ownerId, sellerId),
          inArray(rentals.status, [...OUTSTANDING_RENTAL_STATUSES]),
          lte(rentals.endDate, soonCutoff),
        ),
      )
      .orderBy(asc(rentals.endDate))
      .limit(ALERTS_LIMIT),
  ]);

  const now = new Date();
  return {
    lowStock: lowStockRows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      imageUrl: row.imageUrl ?? null,
      availableQuantity: Number(row.availableQuantity),
      quantity: Number(row.quantity),
      status: row.status,
    })),
    returningSoon: rentalRows.map((row) => ({
      id: row.id,
      productId: row.productId,
      title: row.title,
      slug: row.slug ?? null,
      imageUrl: row.imageUrl ?? null,
      renterName: row.renterName ?? null,
      status: row.status,
      endDate: row.endDate.toISOString(),
      daysUntilDue: daysUntil(row.endDate, now),
    })),
  };
}
