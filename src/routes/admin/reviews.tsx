import { createFileRoute } from "@tanstack/react-router";
import { AdminReviewsPage } from "@/features/admin";

/** `/admin/reviews` — product reviews. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/reviews")({
  component: AdminReviewsPage,
});