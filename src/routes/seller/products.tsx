import { createFileRoute } from "@tanstack/react-router";
import { sellerListingsRouteOptions } from "@/features/seller-listings/route";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/dashboard/products` — the seller's own listings.
 *
 * `requireSeller` rather than `requireAuth`: the page is the product-management
 * surface, and letting a customer load it produced a 403 on every panel rather
 * than an explanation of how to start selling. `/dashboard/messages` stays
 * `requireAuth` because a customer may have a conversation with a seller.
 *
 * The guard is UX, not security — every request behind this page is scoped to the
 * session's seller id by `server/lib/seller-product-queries.ts`.
 */
export const Route = createFileRoute("/dashboard/products")({
  beforeLoad: requireSeller,
  ...sellerListingsRouteOptions,
});
