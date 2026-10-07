import { createFileRoute } from "@tanstack/react-router";
import { cartRouteOptions } from "@/features/cart/route";
import { requireAuth } from "@/lib/auth/guards";

/**
 * `/cart` — the cart is server-persisted per user, so it is always protected.
 *
 * `requireAuth` is the app's existing guard: while the session resolves it
 * bounces to `/auth-check`, and a guest is sent to `/login?redirect=/cart` so
 * they land back here afterwards. There is no cart-specific auth path.
 */
export const Route = createFileRoute("/cart")({
  ...cartRouteOptions,
  beforeLoad: requireAuth,
});
