import type { Pagination } from "@/lib/api/client";

/**
 * Review vocabulary and payload shapes.
 *
 * The status and purchase-type unions **mirror** the server's
 * `server/lib/review-queries.ts` rather than importing it: that module is in the
 * server tsconfig and pulls in drizzle and the database pool, so sharing it
 * would drag both into the browser bundle. `tests/review-vocabulary.test.ts`
 * asserts the two agree, which is what makes the mirror safe — a server-side
 * value change fails a *client* test instead of silently rendering blank.
 */

/* -------------------------------- vocabulary ------------------------------- */

/** Moderation state. Only `PUBLISHED` is ever shown publicly. */
export type ReviewStatus = "PUBLISHED" | "HIDDEN" | "PENDING";

export const REVIEW_STATUSES: readonly ReviewStatus[] = ["PUBLISHED", "HIDDEN", "PENDING"];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PUBLISHED: "Published",
  HIDDEN: "Hidden",
  PENDING: "Pending",
};

/** Whether the reviewer bought or rented the thing. */
export type ReviewPurchaseType = "PURCHASE" | "RENTAL";

export const REVIEW_PURCHASE_TYPES: readonly ReviewPurchaseType[] = ["PURCHASE", "RENTAL"];

/** The badge text. Never rendered for an unverified row — see `isVerifiedPurchase`. */
export const PURCHASE_TYPE_LABELS: Record<ReviewPurchaseType, string> = {
  PURCHASE: "Verified Purchase",
  RENTAL: "Verified Rental",
};

/** Sorts the API actually implements; nothing else may be offered. */
export type ReviewSort = "relevant" | "newest" | "highest" | "lowest" | "helpful";

export const REVIEW_SORTS: readonly ReviewSort[] = [
  "relevant",
  "newest",
  "highest",
  "lowest",
  "helpful",
];

export const REVIEW_SORT_LABELS: Record<ReviewSort, string> = {
  relevant: "Most Relevant",
  newest: "Newest",
  highest: "Highest Rated",
  lowest: "Lowest Rated",
  helpful: "Most Helpful",
};

/** Star values, highest first — the order the filter chips and bars are drawn in. */
export const REVIEW_RATINGS = [5, 4, 3, 2, 1] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export const REVIEW_RATING_LABELS: Record<ReviewRating, string> = {
  5: "5 Stars",
  4: "4 Stars",
  3: "3 Stars",
  2: "2 Stars",
  1: "1 Star",
};

/* --------------------------------- filters --------------------------------- */

/**
 * What the review section is currently showing. Every field maps onto a query
 * parameter the endpoint understands, and `page` is part of it so each
 * combination is its own cache entry.
 */
export type ReviewFilters = {
  /** `null` = all ratings. */
  rating: number | null;
  /** `null` = both purchases and rentals. */
  purchaseType: ReviewPurchaseType | null;
  sort: ReviewSort;
  page: number;
  pageSize: number;
};

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  rating: null,
  purchaseType: null,
  sort: "relevant",
  page: 1,
  pageSize: 5,
};

/* -------------------------------- payloads --------------------------------- */

/** Who wrote a review. Deliberately never carries email or phone. */
export type ReviewAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

/** The listing a review is about. `slug` is null once a product is removed. */
export type ReviewProduct = {
  id: number;
  title: string | null;
  slug: string | null;
};

/**
 * One review.
 *
 * `viewerOwnsReview` and `viewerMarkedHelpful` are resolved server-side, in the
 * same query as the row, so a card can decide what to offer without a request
 * per review — and so a client cannot claim authorship it does not have.
 */
export type Review = {
  id: number;
  rating: number;
  title: string | null;
  comment: string;
  purchaseType: ReviewPurchaseType;
  /**
   * The backend verified an order line behind this review. It is true *because*
   * the server resolved the order, never because the browser asked.
   */
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  isEdited: boolean;
  helpfulCount: number;
  viewerMarkedHelpful: boolean;
  images: string[];
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: ReviewAuthor;
  product: ReviewProduct;
  viewerOwnsReview: boolean;
  /** Null for a legacy review whose order line no longer exists. */
  orderItemId: number | null;
};

/** One of the viewer's order lines, and whether it can carry a review. */
export type ReviewableLine = {
  orderItemId: number;
  orderId: number;
  orderNumber: string | null;
  title: string;
  purchaseType: ReviewPurchaseType;
  eligible: boolean;
  /** Why not, in a sentence. Null when `eligible`. */
  reason: string | null;
  /** The line's existing review, so the UI offers Edit rather than Write. */
  existingReviewId: number | null;
  purchaseDate: string;
};

/**
 * Whether the viewer may write a review for a product, and which line to attach
 * it to. The only thing the form posts is `orderItemId` — the rest is the
 * server's conclusion and is not accepted back.
 */
export type ReviewEligibility = {
  canReview: boolean;
  reason: string | null;
  orderItemId: number | null;
  purchaseType: ReviewPurchaseType | null;
  lines: ReviewableLine[];
} | null;

/** One bucket of the rating distribution. `share` is 0–1. */
export type RatingBucket = {
  stars: number;
  count: number;
  share: number;
};

/** The aggregate. Always five buckets so the bars never resize on load. */
export type RatingSummary = {
  average: number;
  count: number;
  distribution: RatingBucket[];
  fiveStarShare: number;
  purchaseCount: number;
  rentalCount: number;
};

/** What `GET /api/reviews/product/:idOrSlug` returns. */
export type ProductReviewsResponse = {
  items: Review[];
  summary: RatingSummary;
  filters: Omit<ReviewFilters, "pageSize">;
  eligibility: ReviewEligibility;
};

/** What `GET /api/reviews/mine`, `/seller` and `/moderation` return. */
export type ReviewListResponse = {
  items: Review[];
  /**
   * Server-computed. Carried alongside the rows rather than derived from their
   * length, so a full page that happens to be the last one does not offer a
   * "next" button leading nowhere.
   */
  pagination: Pagination;
  /** Seller view only: per-product averages, so no second request per product. */
  stats?: { productId: number; average: number; count: number }[];
};

/** The filters the three list endpoints accept, plus their page size. */
export type ReviewListFilters = {
  status?: ReviewStatus | null;
  rating?: number | null;
  page?: number;
  pageSize?: number;
};

/** The create/edit body. No `userId`, no `isVerifiedPurchase`, no `status`. */
export type ReviewInput = {
  orderItemId?: number;
  rating: number;
  title: string;
  comment: string;
  images: string[];
};

/** The result of marking a review helpful. */
export type HelpfulResult = {
  reviewId: number;
  helpfulCount: number;
  markedHelpful: boolean;
};
