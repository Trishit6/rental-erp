/**
 * Public surface of the reviews feature.
 *
 * Four surfaces consume it, and only these exports cross the boundary:
 *
 *  - `ReviewSection` — the product page.
 *  - `ReviewProductButton` — one eligible order line on the order page.
 *  - `MyReviewsSection` — the account area.
 *  - `SellerReviewsSection` — `/dashboard/reviews`.
 *  - `ModerationSection` — the admin page's review tab.
 *
 * Everything else (the card, the form, the filters) is co-located detail that no
 * other feature needs to name. Nothing here re-exports the query hooks for
 * convenience: a feature that wants *data* about reviews uses these components,
 * so a second surface cannot end up inventing its own fetching and invalidation.
 */

export { ReviewSection } from "./components/ReviewSection";
export { ReviewProductButton } from "./components/ReviewProductButton";
export { MyReviewsSection } from "./components/MyReviewsSection";
export { SellerReviewsSection } from "./components/SellerReviewsSection";
export { ModerationSection } from "./components/ModerationSection";

export { RatingStars } from "./components/RatingStars";
export { ReviewCard } from "./components/ReviewCard";

export {
  DEFAULT_REVIEW_FILTERS,
  PURCHASE_TYPE_LABELS,
  REVIEW_PURCHASE_TYPES,
  REVIEW_RATINGS,
  REVIEW_RATING_LABELS,
  REVIEW_SORTS,
  REVIEW_SORT_LABELS,
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type Review,
  type ReviewEligibility,
  type ReviewFilters,
  type ReviewPurchaseType,
  type ReviewSort,
  type ReviewStatus,
  type RatingSummary,
} from "./types";
