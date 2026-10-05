import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { orders, orderItems, products, rentals, reviews, users } from "../schema";
import { isSellerRole } from "./seller-access";
import type { SessionUser } from "./auth";

/**
 * The activity timeline.
 *
 * ## Why there is no `activity_events` table
 *
 * The obvious design for an activity feed is an append-only table written at the
 * same moment as each action — the same shape `rental_events` uses. It is
 * deliberately *not* what this does, for three reasons that compound:
 *
 *  1. **It would be a second source of truth for facts this database already holds.**
 *     An order's `createdAt` is the moment it was placed. A row saying "placed an
 *     order, at T" is the same fact in a second place, and the two disagree the
 *     moment a backfill, a re-seed or a `db:seed:history` run touches one of them.
 *  2. **It would need its own idempotency story**, which is the entire
 *     `notifications.event_key` problem again — and an activity feed whose duplicate
 *     suppression is weaker than its notification feed's is worse than useless.
 *  3. **It cannot be correct for seeded and historical data.** This database already
 *     holds twelve months of `seed-history` volume. An event table would have to be
 *     back-filled from the very rows it duplicates, and the back-fill is exactly the
 *     code that goes untested.
 *
 * So the timeline is a **query**: each source table contributes the rows that are
 * itself the evidence of the event, and the merge happens in memory. It is correct
 * for a row written yesterday and for a row written eleven months ago by the same
 * code path, and it cannot drift.
 *
 * ## What it deliberately excludes
 *
 * Anything the session user did *not* do or have done to them. There is no branch
 * that reads `admin_audit_log`, and no branch that reports another user's activity —
 * an activity feed is a private record of one person's own history, so an admin
 * reads their own feed here and reaches for the admin workspace for everyone else's.
 */

/** The kinds of step that can appear on the timeline. */
export const ACTIVITY_KINDS = [
  "ACCOUNT_CREATED",
  "ORDER_PLACED",
  "ORDER_DELIVERED",
  "RENTAL_BOOKED",
  "RENTAL_STARTED",
  "RENTAL_RETURNED",
  "REVIEW_SUBMITTED",
  "LISTING_CREATED",
  "PRODUCT_SOLD",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  /** A resolved internal route, or `null` when the entity is gone. */
  link: string | null;
  /** ISO timestamp. */
  at: string;
};

/**
 * Per-source cap.
 *
 * The merge is done in memory, so a source that could return unboundedly many rows
 * would make the page size mean nothing. 200 per source is far beyond any
 * plausible per-person total for the tables involved, and the bound is stated here
 * rather than left implicit: past it, the feed shows the most recent 200 of that
 * kind. Written as a named constant because "why is this 200" is otherwise a
 * question with no answer in the file.
 */
const PER_SOURCE_LIMIT = 200;

type Draft = {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  link: string | null;
  at: Date | null;
};

/** `ORDER_DELIVERED` is asserted at this order status or later. */
const DELIVERED_ORDER_STATUSES = ["DELIVERED", "COMPLETED"] as const;

function orderLink(orderNumber: string | null, orderId: number): string {
  return orderNumber ? `/orders/${encodeURIComponent(orderNumber)}` : `/orders/${orderId}`;
}

function productLink(slug: string | null, productId: number): string {
  return slug ? `/product/${encodeURIComponent(slug)}` : `/product/${productId}`;
}

/**
 * Build the timeline for one session user.
 *
 * Runs every source concurrently. They are genuinely independent — different tables,
 * no shared predicate — so serialising them would multiply the page's latency by
 * seven for no benefit.
 */
export async function buildActivityTimeline(
  user: SessionUser,
): Promise<{ items: ActivityItem[]; total: number }> {
  const seller = isSellerRole(user.role);
  const userId = user.id;

  const [
    accountRows,
    orderRows,
    deliveredRows,
    rentalRows,
    reviewRows,
    listingRows,
    soldRows,
  ] = await Promise.all([
    // The account itself. One row, fetched rather than assumed so the timestamp is
    // the database's `createdAt` and not a client-supplied one.
    db
      .select({ id: users.id, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),

    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        createdAt: orders.createdAt,
        itemCount: orderItems.id,
      })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(PER_SOURCE_LIMIT),

    db
      .select({ id: orders.id, orderNumber: orders.orderNumber, updatedAt: orders.updatedAt })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          inArray(orders.status, [...DELIVERED_ORDER_STATUSES]),
        ),
      )
      .orderBy(desc(orders.updatedAt))
      .limit(PER_SOURCE_LIMIT),

    // Rentals the user *took out*. `ownerId` is deliberately not read here: a rental
    // appearing twice on one person's timeline — once as renter, once as owner —
    // would be the owner's business being reported to them, and the seller workspace
    // already has a rentals view for that.
    db
      .select({
        id: rentals.id,
        createdAt: rentals.createdAt,
        startDate: rentals.startDate,
        actualReturnDate: rentals.actualReturnDate,
        status: rentals.status,
      })
      .from(rentals)
      .where(eq(rentals.renterId, userId))
      .orderBy(desc(rentals.createdAt))
      .limit(PER_SOURCE_LIMIT),

    db
      .select({
        id: reviews.id,
        createdAt: reviews.createdAt,
        rating: reviews.rating,
        purchaseType: reviews.purchaseType,
        productSlug: products.slug,
        productId: reviews.productId,
      })
      .from(reviews)
      .innerJoin(products, eq(reviews.productId, products.id))
      .where(eq(reviews.userId, userId))
      .orderBy(desc(reviews.createdAt))
      .limit(PER_SOURCE_LIMIT),

    // Seller-side sources are gated on the role rather than filtered by sellerId in
    // SQL alone: a customer who somehow has listings (a role demotion mid-session)
    // should not have their own public listings reported back as activity.
    seller
      ? db
          .select({ id: products.id, title: products.title, slug: products.slug, createdAt: products.createdAt })
          .from(products)
          .where(eq(products.sellerId, userId))
          .orderBy(desc(products.createdAt))
          .limit(PER_SOURCE_LIMIT)
      : Promise.resolve([] as { id: number; title: string; slug: string; createdAt: Date }[]),

    seller
      ? db
          .select({
            orderItemId: orderItems.id,
            productId: orderItems.productId,
            title: orderItems.titleSnapshot,
            slug: products.slug,
            quantity: orderItems.quantity,
            mode: orderItems.mode,
            at: orders.updatedAt,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .innerJoin(products, eq(orderItems.productId, products.id))
          .where(
            and(
              eq(orderItems.sellerId, userId),
              inArray(orders.status, [...DELIVERED_ORDER_STATUSES]),
            ),
          )
          .orderBy(desc(orders.updatedAt))
          .limit(PER_SOURCE_LIMIT)
      : Promise.resolve([] as never[]),
  ]);

  const drafts: Draft[] = [];

  const [account] = accountRows;
  if (account) {
    drafts.push({
      id: "account",
      kind: "ACCOUNT_CREATED",
      title: "Joined Revaro",
      description: "Your account was created.",
      link: "/profile",
      at: account.createdAt,
    });
  }

  // One entry per order, not per line: the inner join above exists only to know the
  // order had lines, and an order with nine lines must read as nine *purchases* in
  // one order, not as nine separate order events.
  const seenOrders = new Set<number>();
  for (const row of orderRows) {
    if (seenOrders.has(row.id)) continue;
    seenOrders.add(row.id);
    drafts.push({
      id: `order:${row.id}`,
      kind: "ORDER_PLACED",
      title: `Order ${row.orderNumber ?? `#${row.id}`} placed`,
      description: null,
      link: orderLink(row.orderNumber, row.id),
      at: row.createdAt,
    });
  }

  for (const row of deliveredRows) {
    drafts.push({
      id: `delivered:${row.id}`,
      kind: "ORDER_DELIVERED",
      title: `Order ${row.orderNumber ?? `#${row.id}`} delivered`,
      description: null,
      link: orderLink(row.orderNumber, row.id),
      at: row.updatedAt,
    });
  }

  for (const row of rentalRows) {
    drafts.push({
      id: `rental:${row.id}`,
      kind: "RENTAL_BOOKED",
      title: "Rental booked",
      description: null,
      link: `/rentals/${row.id}`,
      at: row.createdAt,
    });
    // The start and the return are separate steps with separate real timestamps, and
    // they are exactly the two a customer comes back to check.
    if (row.status !== "CONFIRMED") {
      drafts.push({
        id: `rental-started:${row.id}`,
        kind: "RENTAL_STARTED",
        title: "Rental started",
        description: null,
        link: `/rentals/${row.id}`,
        at: row.startDate,
      });
    }
    if (row.actualReturnDate) {
      drafts.push({
        id: `rental-returned:${row.id}`,
        kind: "RENTAL_RETURNED",
        title: "Rental returned",
        description: null,
        link: `/rentals/${row.id}`,
        at: row.actualReturnDate,
      });
    }
  }

  for (const row of reviewRows) {
    drafts.push({
      id: `review:${row.id}`,
      kind: "REVIEW_SUBMITTED",
      title: `Review submitted — ${row.rating}/5`,
      description: row.purchaseType === "RENTAL" ? "Rental review" : "Purchase review",
      link: productLink(row.productSlug, row.productId),
      at: row.createdAt,
    });
  }

  for (const row of listingRows) {
    drafts.push({
      id: `listing:${row.id}`,
      kind: "LISTING_CREATED",
      title: `Listing created — ${row.title}`,
      description: null,
      link: productLink(row.slug, row.id),
      at: row.createdAt,
    });
  }

  for (const row of soldRows) {
    drafts.push({
      id: `sold:${row.orderItemId}`,
      kind: "PRODUCT_SOLD",
      title:
        row.quantity > 1
          ? `Sold ${row.quantity}× ${row.title}`
          : `${row.mode === "RENT" ? "Rental completed" : "Sold"} — ${row.title}`,
      description: null,
      link: productLink(row.slug, row.productId),
      at: row.at,
    });
  }

  const items = drafts
    // `at` can be null only where a nullable column fed it, and an event with no
    // timestamp cannot be placed on a timeline — so it is dropped rather than
    // rendered with an invented date.
    .filter((draft): draft is Draft & { at: Date } => draft.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))
    .map((draft) => ({
      id: draft.id,
      kind: draft.kind,
      title: draft.title,
      description: draft.description,
      link: draft.link,
      at: draft.at.toISOString(),
    }));

  return { items, total: items.length };
}

/**
 * Paginate a timeline.
 *
 * Applied after the merge rather than in SQL, because the seven sources have
 * different shapes and a `UNION` over them would have to invent a common nullable
 * column set to express — at which point it is a `CASE` expression per row instead
 * of readable code. The cost is that pagination is applied to the merged, bounded
 * set; `PER_SOURCE_LIMIT` documents why that is safe.
 */
export function paginateActivity(
  timeline: ActivityItem[],
  page: number,
  pageSize: number,
): { items: ActivityItem[]; page: number; pageSize: number; totalPages: number } {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safeSize = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 50) : 20;
  return {
    items: timeline.slice((safePage - 1) * safeSize, safePage * safeSize),
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.max(1, Math.ceil(timeline.length / safeSize)),
  };
}

/**
 * The kinds present in a timeline, for the filter chips.
 *
 * Derived from the items rather than declared, so a chip never appears for a kind
 * this user has no history of — which is what stops the filter row from being a
 * static list of nine labels that mostly return nothing.
 */
export function activityKindsPresent(items: readonly ActivityItem[]): ActivityKind[] {
  const present = new Set(items.map((item) => item.kind));
  return ACTIVITY_KINDS.filter((kind) => present.has(kind));
}

/** Narrowing helper reused by the route so a bad `kind` degrades instead of 400ing. */
export function isActivityKind(value: string): value is ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(value);
}