import { createFileRoute } from "@tanstack/react-router";
import { AdminReviewsPage } from "@/features/admin";

/**
 * `/admin/reviews/sellers` — reviews a seller has replied to.
 *
 * Revaro has exactly one review entity, written by a customer about a product line. There
 * is no review-of-a-seller record, and inventing a second table would create rows nothing
 * writes. The server's `scope=seller` therefore filters to reviews carrying a seller
 * reply — the honest closest equivalent — and the page header says so in those words
 * rather than implying a seller rating exists.
 *
 * Guarded by the parent layout's `requireAdmin`.
 */
export const Route = createFileRoute("/admin/reviews/sellers")({
  component: () => <AdminReviewsPage mode="seller" />,
});
