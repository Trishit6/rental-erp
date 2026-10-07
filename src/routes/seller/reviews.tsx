import { createFileRoute } from "@tanstack/react-router";
import { SellerReviewsSection } from "@/features/reviews";
import { requireAuth } from "@/lib/auth/guards";

/**
 * `/seller/reviews` — reviews of the signed-in seller's own listings.
 *
 * `requireAuth` rather than `requireSeller`: the server scopes the list with an
 * EXISTS over `products.seller_id`, so a customer who navigates here simply sees
 * an empty list instead of a permission error. The guard's job is to make sure
 * nobody reaches a page that would need to ask "whose reviews?", and it does not
 * get to decide whether *this* viewer is a seller.
 */
export const Route = createFileRoute("/seller/reviews")({
  beforeLoad: requireAuth,
  component: SellerReviewsPage,
});

function SellerReviewsPage() {
  return (
    <div className="page-wrap pb-10 pt-8">
      <SellerReviewsSection />
    </div>
  );
}
