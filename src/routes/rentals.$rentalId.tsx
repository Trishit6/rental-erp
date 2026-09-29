import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth/guards";
import { rentalDetailRouteOptions } from "@/features/rentals/route";

/**
 * `/rentals/$rentalId` — protected.
 *
 * Ownership is enforced on the server, not here: the guard proves the visitor is
 * *a* user, only the API can prove the rental is *theirs*.
 */
export const Route = createFileRoute("/rentals/$rentalId")({
  ...rentalDetailRouteOptions,
  beforeLoad: requireAuth,
});
