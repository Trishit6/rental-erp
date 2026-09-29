import { and, asc, desc, eq, exists, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { rentals } from "../schema";
import {
  isRentalBucket,
  isRentalStatus,
  statusesForBucket,
  type RentalBucket,
  type RentalStatus,
} from "./rental-lifecycle";

/**
 * Rental list query vocabulary.
 *
 * The same rules the order list follows: these values arrive from a URL anyone
 * can edit, so everything coerces and degrades rather than throwing, and the
 * rental lifecycle constants above are the single source of truth for what a
 * status may be.
 */

export const RENTAL_SORTS = ["newest", "oldest", "ending_soon", "starting_soon"] as const;
export type RentalSort = (typeof RENTAL_SORTS)[number];

/**
 * Whose rentals to return.
 *
 * `renter` is the default because this is the customer-facing endpoint — "my
 * rentals" means the ones I booked. `owner` is the other side of the same table
 * (rentals of my listings) and `all` is the union, which is what the dashboard
 * surfaces have always received and must keep receiving.
 */
export const RENTAL_ROLES = ["renter", "owner", "all"] as const;
export type RentalRole = (typeof RENTAL_ROLES)[number];

export const rentalsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).catch(20).optional(),
  search: z.string().trim().max(120).catch("").default(""),
  status: z.string().trim().optional().catch(undefined),
  bucket: z.string().trim().optional().catch(undefined),
  sort: z.string().trim().optional().catch(undefined),
  role: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
});

export type RentalsListQuery = z.infer<typeof rentalsListQuerySchema>;

export type ResolvedRentalFilters = {
  /** Null when the caller did not ask for pagination; the full list is returned. */
  page: number | null;
  pageSize: number;
  search: string;
  status: RentalStatus | null;
  bucket: RentalBucket | null;
  sort: RentalSort;
  role: RentalRole;
  from: Date | null;
  to: Date | null;
};

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseBoundary(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const suffix = BARE_DATE.test(value) ? (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z") : "";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Pagination is **opt-in**.
 *
 * The dashboard surfaces that predate this feature read the full list and group
 * it themselves; silently capping them at one page would drop rows with no
 * visible error. So a caller that wants pagination asks for it, and one that
 * does not keeps getting everything.
 */
export function resolveRentalFilters(raw: unknown): ResolvedRentalFilters {
  const parsed = rentalsListQuerySchema.parse(raw ?? {});
  const wantsPaging = parsed.page !== undefined || parsed.pageSize !== undefined;

  return {
    page: wantsPaging ? (parsed.page ?? 1) : null,
    pageSize: parsed.pageSize ?? 20,
    search: parsed.search.trim(),
    status: isRentalStatus(parsed.status) ? parsed.status : null,
    bucket: isRentalBucket(parsed.bucket) ? parsed.bucket : null,
    sort: (RENTAL_SORTS as readonly string[]).includes(parsed.sort ?? "")
      ? (parsed.sort as RentalSort)
      : "newest",
    role: (RENTAL_ROLES as readonly string[]).includes(parsed.role ?? "")
      ? (parsed.role as RentalRole)
      : "renter",
    from: parseBoundary(parsed.from, false),
    to: parseBoundary(parsed.to, true),
  };
}

/** The scope predicate for a role. Never derived from the request body. */
export function rentalRoleCondition(userId: number, role: RentalRole) {
  if (role === "owner") return eq(rentals.ownerId, userId);
  if (role === "all") return or(eq(rentals.renterId, userId), eq(rentals.ownerId, userId))!;
  return eq(rentals.renterId, userId);
}

export function buildRentalFilters(filters: ResolvedRentalFilters) {
  const conditions = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    // Product name comes from the live listing (rentals have no title snapshot
    // of their own — the order item holds that), and the order number is what
    // the customer was actually given. Parentheses are part of the template:
    // drizzle's `exists()` emits `exists <expr>` with no wrapping.
    conditions.push(
      or(
        exists(
          sql`(SELECT 1 FROM products p
               WHERE p.id = ${rentals.productId} AND p.title LIKE ${pattern})`,
        ),
        exists(
          sql`(SELECT 1 FROM order_items oi
               WHERE oi.id = ${rentals.orderItemId} AND oi.title_snapshot LIKE ${pattern})`,
        ),
        exists(
          sql`(SELECT 1 FROM orders o
               WHERE o.id = ${rentals.orderId} AND o.order_number LIKE ${pattern})`,
        ),
        like(sql`CAST(${rentals.id} AS CHAR)`, pattern),
      )!,
    );
  }

  if (filters.status) {
    conditions.push(eq(rentals.status, filters.status));
  } else if (filters.bucket) {
    conditions.push(inArray(rentals.status, statusesForBucket(filters.bucket)));
  }

  if (filters.from) conditions.push(gte(rentals.startDate, filters.from));
  if (filters.to) conditions.push(lte(rentals.startDate, filters.to));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function buildRentalSort(sort: RentalSort) {
  switch (sort) {
    case "oldest":
      return [asc(rentals.startDate), asc(rentals.id)];
    case "ending_soon":
      return [asc(rentals.endDate), asc(rentals.id)];
    case "starting_soon":
      return [asc(rentals.startDate), asc(rentals.id)];
    case "newest":
    default:
      // `id` breaks ties so pagination is stable when two rentals share a date.
      return [desc(rentals.createdAt), desc(rentals.id)];
  }
}
