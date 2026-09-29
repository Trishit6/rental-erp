import { and, asc, desc, eq, exists, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { orders } from "../schema";

/**
 * Order list query vocabulary.
 *
 * The order lifecycle is stored in a `varchar`, so this module is the single
 * place that decides which values are *real*. Two reasons that matters:
 *
 *  - The filter UI must not offer a state nothing can produce. Offering
 *    "Out for delivery" against a backend that has never heard of it is a
 *    filter that can only ever return nothing.
 *  - The opposite risk is worse: a status written by a future feature (or by
 *    seed data that predates this vocabulary) must still render. So the badge
 *    layer treats this list as *known* values and falls back to a neutral style
 *    for anything else, rather than throwing or rendering blank.
 *
 * Filtering by a rental status is a separate axis from `orders.status`: it means
 * "orders that contain a rental in this state", so it is applied as an EXISTS
 * over the rentals table rather than an equality on the order.
 */

/** Fulfillment lifecycle, in the order a normal order moves through it. */
export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "READY_FOR_PICKUP",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Legacy values that predate the lifecycle above and still exist in the
 * database. Listed so the badge can speak about them honestly rather than
 * showing an unrecognised token.
 */
export const LEGACY_ORDER_STATUSES = ["PAID"] as const;

export const ORDER_TYPES = ["PURCHASE", "RENTAL", "MIXED"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/** Rental states an order can be filtered by. */
export const RENTAL_STATUSES = [
  "CONFIRMED",
  "ACTIVE",
  "RETURN_PENDING",
  "OVERDUE",
  "RETURNED",
  "CANCELLED",
  "DISPUTED",
] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const ORDER_SORTS = ["newest", "oldest", "total_desc", "total_asc", "updated_desc"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

/**
 * Prefix that namespaces a *rental* status inside the flat filter vocabulary.
 *
 * Without it, `CONFIRMED` would be ambiguous: an order can be CONFIRMED and a
 * rental on it can independently be CONFIRMED, and they are different columns.
 * One flat list of both axes would offer two chips with the same value, of which
 * only one could ever match.
 */
export const RENTAL_STATUS_PREFIX = "RENTAL_";

export function isRentalStatusFilter(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.startsWith(RENTAL_STATUS_PREFIX) &&
    (RENTAL_STATUSES as readonly string[]).includes(value.slice(RENTAL_STATUS_PREFIX.length))
  );
}

/** `RENTAL_ACTIVE` → `ACTIVE`. The inverse of the namespacing above. */
export function toRentalStatus(filterValue: string): RentalStatus {
  return filterValue.slice(RENTAL_STATUS_PREFIX.length) as RentalStatus;
}

/** Every value a `status` filter may take, with the rental axis namespaced. */
export const ORDER_STATUS_FILTERS = [
  ...ORDER_STATUSES,
  ...RENTAL_STATUSES.map((status) => `${RENTAL_STATUS_PREFIX}${status}`),
] as const;
export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];

export function isOrderStatusFilter(value: unknown): value is OrderStatusFilter {
  return typeof value === "string" && (ORDER_STATUS_FILTERS as readonly string[]).includes(value);
}

/**
 * List query. Coerced and `.catch()`-guarded rather than strict, because these
 * arrive as query strings: an unknown sort or a nonsense page must degrade to a
 * usable list, not throw a route-level 400 and leave the customer staring at an
 * error page over a mistyped URL.
 */
export const ordersListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(20).default(20),
  search: z.string().trim().max(120).catch("").default(""),
  status: z.string().trim().optional().catch(undefined),
  type: z.string().trim().optional().catch(undefined),
  sort: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
});

export type OrdersListQuery = z.infer<typeof ordersListQuerySchema>;

export type ResolvedOrderFilters = {
  page: number;
  pageSize: number;
  search: string;
  status: OrderStatusFilter | null;
  type: OrderType | null;
  sort: OrderSort;
  /** Inclusive lower bound, or null. */
  from: Date | null;
  /** Inclusive upper bound (end of that day), or null. */
  to: Date | null;
};

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date boundary that is a real date, or null. Never throws.
 *
 * A bare `2026-03-04` means the whole of that day to a customer, so `to` is
 * pushed to the end of it — otherwise "until 4 March" would silently exclude
 * everything ordered on the 4th.
 */
function parseBoundary(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const suffix = BARE_DATE.test(value) ? (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z") : "";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveOrderFilters(raw: unknown): ResolvedOrderFilters {
  const parsed = ordersListQuerySchema.parse(raw ?? {});

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    search: parsed.search.trim(),
    status: isOrderStatusFilter(parsed.status) ? parsed.status : null,
    type: (ORDER_TYPES as readonly string[]).includes(parsed.type ?? "")
      ? (parsed.type as OrderType)
      : null,
    sort: (ORDER_SORTS as readonly string[]).includes(parsed.sort ?? "")
      ? (parsed.sort as OrderSort)
      : "newest",
    from: parseBoundary(parsed.from, false),
    to: parseBoundary(parsed.to, true),
  };
}

export function buildOrderListFilters(filters: ResolvedOrderFilters) {
  const conditions = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    // Search covers the order number the customer was given *and* the product
    // names in the order. Product names come from the order-item snapshot, not
    // the live product: a customer searching for what they bought must find it
    // even after the listing is renamed or removed.
    //
    // The parentheses are part of the template, not `exists()`'s job: drizzle
    // emits `exists <expr>`, so a bare `SELECT ...` here is a syntax error.
    conditions.push(
      or(
        like(orders.orderNumber, pattern),
        exists(
          sql`(SELECT 1 FROM order_items oi
               WHERE oi.order_id = ${orders.id}
                 AND oi.title_snapshot LIKE ${pattern})`,
        ),
      )!,
    );
  }

  if (filters.status) {
    if (isRentalStatusFilter(filters.status)) {
      // "Rental active" means the order contains a rental in that state — a
      // different column from the order's own status.
      const rentalStatus = toRentalStatus(filters.status);
      conditions.push(
        exists(
          sql`(SELECT 1 FROM rentals r
               WHERE r.order_id = ${orders.id} AND r.status = ${rentalStatus})`,
        ),
      );
    } else {
      conditions.push(eq(orders.status, filters.status));
    }
  }

  if (filters.type) {
    // A "Rentals" filter must also catch a MIXED order that contains a rental,
    // otherwise a customer with a combined order would watch it disappear when
    // they filter to rentals.
    if (filters.type === "RENTAL") {
      conditions.push(inArray(orders.orderType, ["RENTAL", "MIXED"]));
    } else if (filters.type === "PURCHASE") {
      conditions.push(inArray(orders.orderType, ["PURCHASE", "MIXED"]));
    } else {
      conditions.push(eq(orders.orderType, filters.type));
    }
  }

  if (filters.from) conditions.push(gte(orders.createdAt, filters.from));
  if (filters.to) conditions.push(lte(orders.createdAt, filters.to));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function buildOrderListSort(sort: OrderSort) {
  switch (sort) {
    case "oldest":
      return [asc(orders.createdAt), asc(orders.id)];
    case "total_desc":
      return [desc(orders.total), desc(orders.id)];
    case "total_asc":
      return [asc(orders.total), asc(orders.id)];
    case "updated_desc":
      // "Recently updated" surfaces the order whose state last moved (a
      // cancellation, a fulfillment step) rather than the newest placement.
      return [desc(orders.updatedAt), desc(orders.id)];
    case "newest":
    default:
      // `id` breaks ties so pagination is stable when two orders share a
      // timestamp — without it, page 2 can repeat a row from page 1.
      return [desc(orders.createdAt), desc(orders.id)];
  }
}
