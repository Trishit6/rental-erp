/**
 * Dashboard domain types.
 *
 * Mostly the dashboard is a thin consumer of types owned by the features it
 * composes (orders, rentals, favourites, cart, products, admin stats) — those
 * are imported type-only in `api.ts`, so the wire shapes never drift from the
 * real ones. The only shape invented here is the *activity timeline*, which is
 * derived from data this page already fetched rather than fetched separately.
 */

/** One entry in the "Recent activity" timeline, derived from real rows. */
export type DashboardActivity = {
  key: string;
  kind: "order" | "rental";
  /** Placed / started / returned… — a label, never an invented event. */
  label: string;
  /** URL-safe target for the "details" affordance. */
  href: string;
  /** ISO timestamp, used for ordering and humanized display. */
  at: string;
  /** Optional one-line description shown under the label. */
  description?: string;
  id: number;
};

/** A single stat the customer dashboard shows. */
export type DashboardStat = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  icon: import("lucide-react").LucideIcon;
  to?: string;
};