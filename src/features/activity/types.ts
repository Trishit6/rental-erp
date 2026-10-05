/**
 * Activity-timeline types.
 *
 * ## This is derived, not recorded
 *
 * There is no `activity_events` table. `server/lib/activity.ts` assembles the timeline
 * from the user's own orders, rentals, reviews and listings, which means the timeline
 * cannot disagree with the pages it summarises — an order that shows as delivered in
 * "My orders" shows as delivered here, because it *is* the same row.
 *
 * The consequence is a design constraint the types make visible: there is no
 * "your-notification-was-read" or "you-viewed-a-listing" kind, because those facts are
 * either not recorded or not the user's business to see. The kinds below are the ones
 * the marketplace genuinely tracks about a person.
 */

/** The kinds of step on the timeline. Mirrors `ACTIVITY_KINDS` on the server. */
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

/** Human labels for the filter chips, and for the icon next to each row. */
export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  ACCOUNT_CREATED: "Joined Revaro",
  ORDER_PLACED: "Order placed",
  ORDER_DELIVERED: "Order delivered",
  RENTAL_BOOKED: "Rental booked",
  RENTAL_STARTED: "Rental started",
  RENTAL_RETURNED: "Rental returned",
  REVIEW_SUBMITTED: "Review written",
  LISTING_CREATED: "Listing created",
  PRODUCT_SOLD: "Item sold",
};

/** One step on the timeline. */
export type ActivityItem = {
  /** Stable within a kind — `"ORDER_PLACED:42"` — so React keys stay stable. */
  id: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  /** A resolved internal route, or `null` when the entity has since been deleted. */
  link: string | null;
  /** ISO timestamp. */
  at: string;
};

/** One page of the timeline, plus the chips derived from what the user actually has. */
export type ActivityPage = {
  items: ActivityItem[];
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  /** Only the kinds present in this person's history — never the whole vocabulary. */
  availableKinds: ActivityKind[];
};

/** Query params for one page. */
export type ActivityFilters = {
  page?: number;
  pageSize?: number;
  kind?: ActivityKind | null;
};