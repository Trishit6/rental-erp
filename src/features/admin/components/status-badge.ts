/**
 * Status → badge classes for the admin workspace, on the semantic scale in
 * `styles.css`.
 *
 * ## Why one map for the whole workspace
 *
 * A status is *never* spelled as a raw Tailwind palette class here. `bg-amber-500/15
 * text-amber-700 dark:text-amber-300` was the previous spelling: three colours to keep
 * in step per state, and the identical "delivered/completed" green was
 * `bg-emerald-500/…` in one file while the same state read `bg-accent/12` in the
 * rentals and wallet tables.
 *
 * `warning` / `success` / `muted` are one token each, so a badge in the orders table
 * and the same badge in the rentals table cannot drift. Anything not listed falls back
 * to `bg-muted`, which is the right answer for a status nobody has classified yet — a
 * neutral chip instead of a colour implying a meaning it does not have.
 */

/** Order statuses (`orders.status`). */
export const ORDER_STATUS_BADGE: Record<string, string> = {
  PENDING_PAYMENT: "bg-warning/15 text-warning",
  CONFIRMED: "bg-primary/12 text-primary",
  PROCESSING: "bg-info/15 text-info",
  READY_FOR_PICKUP: "bg-primary/12 text-primary",
  SHIPPED: "bg-info/15 text-info",
  DELIVERED: "bg-success/15 text-success",
  COMPLETED: "bg-success/15 text-success",
  CANCELLED: "bg-muted text-muted-foreground",
};

/** Payment and transaction statuses (`payments.status`, `transactions.status`). */
export const PAYMENT_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-warning/15 text-warning",
  PROCESSING: "bg-info/15 text-info",
  PAID: "bg-success/15 text-success",
  SUCCEEDED: "bg-success/15 text-success",
  FAILED: "bg-destructive/12 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-info/15 text-info",
  PARTIALLY_REFUNDED: "bg-info/15 text-info",
};

/** Rental statuses (`rentals.status`, from `lib/rental-lifecycle`). */
export const RENTAL_STATUS_BADGE: Record<string, string> = {
  CONFIRMED: "bg-primary/12 text-primary",
  ACTIVE: "bg-success/15 text-success",
  RETURN_PENDING: "bg-warning/15 text-warning",
  // Overdue is the one state that genuinely is an alarm, and it is the only one that
  // gets `destructive`. Everything else being a softer chip is what keeps this one
  // legible when it appears.
  OVERDUE: "bg-destructive/12 text-destructive",
  RETURNED: "bg-info/15 text-info",
  COMPLETED: "bg-success/15 text-success",
  CANCELLED: "bg-muted text-muted-foreground",
  DISPUTED: "bg-warning/15 text-warning",
};

/** Account roles (`users.role`) and review statuses (`reviews.status`). */
export const MODERATION_STATUS_BADGE: Record<string, string> = {
  ADMIN: "bg-primary/12 text-primary",
  SELLER: "bg-info/15 text-info",
  USER: "bg-muted text-muted-foreground",
  SUSPENDED: "bg-destructive/12 text-destructive",
  PUBLISHED: "bg-success/15 text-success",
  HIDDEN: "bg-muted text-muted-foreground",
  PENDING: "bg-warning/15 text-warning",
  OPEN: "bg-warning/15 text-warning",
  RESOLVED: "bg-success/15 text-success",
  DISMISSED: "bg-muted text-muted-foreground",
};

/** The fallback, for a status no map above has classified. */
export const NEUTRAL_BADGE = "bg-muted text-muted-foreground";
