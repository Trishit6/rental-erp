import { createFileRoute } from "@tanstack/react-router";
import { rentalsRouteOptions } from "@/features/rentals/route";

/**
 * `/profile/rentals` — an alias of `/rentals`, sharing the one feature module.
 * See `/profile/orders` for why the alias exists; the same reasoning applies.
 */
export const Route = createFileRoute("/_authenticated/profile/rentals")({
  ...rentalsRouteOptions,
});
