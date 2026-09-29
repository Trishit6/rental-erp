import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { products, rentals } from "../schema";
import { HttpError } from "./api";
import { rentalDays } from "../../src/lib/pricing";

/**
 * Rental availability engine — the single source of truth for "can this unit be
 * rented for these dates". Used by order creation, the cart and the product page,
 * so all three agree.
 */

/**
 * The subset of the drizzle surface these helpers need. `db` and a
 * `db.transaction()` handle both satisfy it, which is what lets order creation
 * run its availability checks *inside* the transaction that commits the order.
 *
 * Without that, the check would read through a different connection outside the
 * transaction, so two concurrent checkouts for the last unit could both pass.
 */
export type QueryExecutor = Pick<typeof db, "select">;

/** Rental states that hold a unit for a date range. Anything else frees it up. */
export const ACTIVE_RENTAL_STATUSES = [
  "CONFIRMED",
  "ACTIVE",
  "RETURN_PENDING",
  "OVERDUE",
  "DISPUTED",
];

/** How many rentals of this product overlap the requested window. */
export async function overlappingRentalCount(
  productId: number,
  startDate: Date,
  endDate: Date,
  excludeRentalId?: number,
  executor: QueryExecutor = db,
): Promise<number> {
  const conditions = [
    eq(rentals.productId, productId),
    inArray(rentals.status, ACTIVE_RENTAL_STATUSES),
    lte(rentals.startDate, endDate),
    gte(rentals.endDate, startDate),
  ];
  if (excludeRentalId) {
    conditions.push(ne(rentals.id, excludeRentalId));
  }
  const [{ count }] = await executor
    .select({ count: sql<number>`COUNT(*)` })
    .from(rentals)
    .where(and(...conditions));
  return Number(count);
}

export type RentalAvailability = {
  /** Units free for the requested window. */
  availableUnits: number;
  /** Total units the listing holds. */
  totalUnits: number;
  /** Rentals already holding a unit in that window. */
  overlappingRentals: number;
  isAvailable: boolean;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  /** Days between the requested dates, floored at 1. */
  days: number;
};

/**
 * Read-only availability check for a date range. Throws for a missing,
 * non-rentable or inactive product — never for a busy window (callers decide
 * whether that's an error).
 */
export async function checkRentalAvailability(
  productId: number,
  startDate: Date,
  endDate: Date,
  excludeRentalId?: number,
  executor: QueryExecutor = db,
): Promise<RentalAvailability> {
  const [product] = await executor
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  if (!product.rentalPricePerDay) {
    throw new HttpError(400, "NOT_RENTABLE", "This item is not available for rent.");
  }

  const overlapping = await overlappingRentalCount(
    productId,
    startDate,
    endDate,
    excludeRentalId,
    executor,
  );
  const totalUnits = product.quantity;
  const availableUnits = Math.max(0, totalUnits - overlapping);

  return {
    availableUnits,
    totalUnits,
    overlappingRentals: overlapping,
    isAvailable: availableUnits > 0,
    minimumRentalDays: product.minimumRentalDays,
    maximumRentalDays: product.maximumRentalDays,
    days: rentalDays({ startDate, endDate }),
  };
}

/**
 * Assert a rental request is placeable, throwing an `HttpError` with a
 * user-actionable message otherwise. Reused by order creation AND cart add so
 * the rules can never drift apart.
 */
export async function assertRentalAvailability(
  productId: number,
  quantity: number,
  startDate: Date,
  endDate: Date,
  excludeRentalId?: number,
  executor: QueryExecutor = db,
) {
  const [product] = await executor
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");
  if (!product.rentalPricePerDay) {
    throw new HttpError(400, "NOT_RENTABLE", "This item is not available for rent.");
  }
  if (product.status !== "ACTIVE") {
    throw new HttpError(409, "UNAVAILABLE", "This item is currently unavailable.");
  }
  if (startDate.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    throw new HttpError(400, "BAD_REQUEST", "Start date cannot be in the past.");
  }
  if (product.minimumRentalDays && rentalDays({ startDate, endDate }) < product.minimumRentalDays) {
    throw new HttpError(
      400,
      "MIN_DAYS",
      `Minimum rental period is ${product.minimumRentalDays} days.`,
    );
  }
  if (product.maximumRentalDays && rentalDays({ startDate, endDate }) > product.maximumRentalDays) {
    throw new HttpError(
      400,
      "MAX_DAYS",
      `Maximum rental period is ${product.maximumRentalDays} days.`,
    );
  }

  const overlapping = await overlappingRentalCount(
    productId,
    startDate,
    endDate,
    excludeRentalId,
    executor,
  );
  const available = product.quantity - overlapping;
  if (quantity > available) {
    throw new HttpError(
      409,
      "DATE_RANGE_UNAVAILABLE",
      available <= 0
        ? "Those dates are already booked. Please choose different dates."
        : `Only ${available} unit(s) available for those dates.`,
    );
  }
  return product;
}
