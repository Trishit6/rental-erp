import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth/guards";
import { rentalsRouteOptions } from "@/features/rentals/route";

/**
 * `/rentals` — "My Rentals". Protected: a rental is private, and the server
 * independently derives the renter from the session rather than from the URL.
 *
 * This path previously served a public "Popular rentals" browse page. Browsing
 * rent-capable products now lives at `/browse?type=rent`, which is the same
 * query the old page made and the canonical place for browsing.
 */
export const Route = createFileRoute("/rentals")({
  ...rentalsRouteOptions,
  beforeLoad: requireAuth,
});
