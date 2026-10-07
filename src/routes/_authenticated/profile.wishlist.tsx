import { createFileRoute } from "@tanstack/react-router";
import { favoritesRouteOptions } from "@/features/favorites/route";

/**
 * `/profile/wishlist` — an alias of `/favorites`, sharing the one feature module.
 * The wishlist is the favorites feature; there is exactly one favorite system in
 * this app and this route adds a URL for it, not a second one.
 */
export const Route = createFileRoute("/_authenticated/profile/wishlist")({
  ...favoritesRouteOptions,
});
