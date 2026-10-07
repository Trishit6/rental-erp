import { createFileRoute } from "@tanstack/react-router";
import { favoritesRouteOptions } from "@/features/favorites/route";
import { requireAuth } from "@/lib/auth/guards";

/**
 * `/favorites` — the personal wishlist, so it is always protected.
 *
 * `requireAuth` is the app's existing guard: while the session is still
 * resolving it bounces to `/auth-check`, and a guest is sent to
 * `/login?redirect=/favorites` so they land back here afterwards. There is no
 * favourites-specific auth logic anywhere.
 */
export const Route = createFileRoute("/favorites")({
  ...favoritesRouteOptions,
  beforeLoad: requireAuth,
});
