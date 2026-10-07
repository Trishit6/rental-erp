import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth/guards";
import { ordersRouteOptions } from "@/features/orders/route";

/**
 * `/profile/orders` — an alias of `/orders`, not a second page.
 *
 * The feature (its component, its query hooks, its URL-state schema) is *the same*
 * `ordersRouteOptions` the `/orders` route spreads; there is deliberately no second
 * implementation here. Two URLs for one customer surface exists because the account
 * dropdown (§8) names the destinations My Orders / My Rentals / Wishlist under the
 * profile, while older links — notifications, order confirmation screens, bookmarks —
 * still point at `/orders`, and those must keep working without a redirect hop.
 */
export const Route = createFileRoute("/profile/orders")({
  ...ordersRouteOptions,
  beforeLoad: requireAuth,
});
