import { api, type Pagination } from "@/lib/api/client";
import type {
  HelpfulResult,
  ProductReviewsResponse,
  Review,
  ReviewFilters,
  ReviewInput,
  ReviewListFilters,
  ReviewListResponse,
  ReviewStatus,
} from "./types";

/**
 * Every network call the reviews feature makes. Components never call this file
 * directly — they use the hooks in `./query` — so the cache and the mutations
 * stay in charge of what is fetched when.
 *
 * ## What the client is never allowed to send
 *
 * There is deliberately no `userId`, `sellerId`, `purchaseType`,
 * `isVerifiedPurchase` or `status` in any body below. The server derives all of
 * them from the session and the order, and its schemas are `.strict()`, so a
 * client that adds one gets a `400 VALIDATION_ERROR` rather than a field that
 * happens to be ignored. The only identifier a review write carries is the
 * `orderItemId` it is *about* — which the server resolves and re-checks.
 */

/** Review filters → query string. Defaults are omitted, not sent as blanks. */
function toQueryString(filters: Partial<ReviewFilters>): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  };

  set("rating", filters.rating ?? undefined);
  set("purchaseType", filters.purchaseType ?? undefined);
  set("sort", filters.sort);
  set("page", filters.page);
  set("pageSize", filters.pageSize);

  return params.toString();
}

/**
 * The three list endpoints share one query-string shape.
 *
 * Built by omission rather than by sending blanks: an empty `?status=` would be
 * a value the server has to special-case, and "no filter" is better represented by
 * the parameter not being there at all.
 */
function listQueryString(filters: ReviewListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.rating) params.set("rating", String(filters.rating));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  return params.size > 0 ? `?${params}` : "";
}

/**
 * Pagination is always present in the envelope, but it is typed optional because
 * the client cannot assume a handler sent one. Falling back to the rows actually
 * returned keeps a list pageable rather than leaving `totalPages` undefined and
 * crashing the pager.
 */
function fallbackPagination(pagination: Pagination | undefined, rowCount: number): Pagination {
  return pagination ?? { page: 1, pageSize: rowCount, total: rowCount, totalPages: 1 };
}

/**
 * The product page's review section: one filtered page of reviews, the aggregate
 * summary, and the viewer's own eligibility — together, in one request.
 *
 * They are answered together because they have to be consistent with each other:
 * a summary counting reviews the visible list has filtered out, or a "Write a
 * Review" button for an order the server would refuse, are both bugs this shape
 * makes unrepresentable.
 */
export async function getProductReviews(
  productIdOrSlug: string,
  filters: ReviewFilters,
): Promise<{ data: ProductReviewsResponse; pagination: Pagination }> {
  const result = await api.get<ProductReviewsResponse>(
    `/reviews/product/${encodeURIComponent(productIdOrSlug)}?${toQueryString(filters)}`,
  );
  return {
    data: result.data,
    pagination: fallbackPagination(result.pagination, result.data.items.length),
  };
}

/**
 * One review by id.
 *
 * Visible if it is published or if it is yours — the server refuses to confirm
 * the existence of a hidden review written by somebody else, so this is a 404 for
 * it rather than a 403.
 */
export async function getReview(reviewId: number): Promise<Review> {
  return (await api.get<Review>(`/reviews/${reviewId}`)).data;
}

/** The signed-in customer's own review history. */
export async function getMyReviews(filters: ReviewListFilters = {}): Promise<ReviewListResponse> {
  const suffix = listQueryString(filters);
  const result = await api.get<Review[]>(`/reviews/mine${suffix}`);
  return { items: result.data, pagination: fallbackPagination(result.pagination, result.data.length) };
}

/**
 * Reviews of the signed-in seller's own listings.
 *
 * The server scopes this with an EXISTS over `products.seller_id`, so there is
 * no filter parameter that could widen it to another seller's reviews.
 */
export async function getSellerReviews(filters: ReviewListFilters = {}): Promise<ReviewListResponse> {
  const suffix = listQueryString(filters);
  const result = await api.get<Omit<ReviewListResponse, "pagination">>(`/reviews/seller${suffix}`);
  return {
    items: result.data.items,
    stats: result.data.stats,
    pagination: fallbackPagination(result.pagination, result.data.items.length),
  };
}

/**
 * Write a review.
 *
 * `orderItemId` is the whole authorisation story from the browser's side: the
 * server resolves that line, checks it belongs to the session user and that its
 * order has reached a reviewable state. Everything else about the transaction is
 * the server's to determine.
 */
export async function createReview(input: ReviewInput): Promise<Review> {
  return (
    await api.post<Review>("/reviews", {
      orderItemId: input.orderItemId,
      rating: input.rating,
      title: input.title,
      comment: input.comment,
      images: input.images,
    })
  ).data;
}

/** Edit your own review. `orderItemId` is not part of an edit by design. */
export async function updateReview(reviewId: number, input: ReviewInput): Promise<Review> {
  return (
    await api.patch<Review>(`/reviews/${reviewId}`, {
      rating: input.rating,
      title: input.title,
      comment: input.comment,
      images: input.images,
    })
  ).data;
}

/** Remove your own review. Frees the order line, so it can be reviewed again. */
export async function deleteReview(reviewId: number): Promise<{ deleted: boolean }> {
  return (await api.delete<{ deleted: boolean }>(`/reviews/${reviewId}`)).data;
}

/** Toggle "this helped". The server refuses a second vote from the same person. */
export async function toggleReviewHelpful(reviewId: number): Promise<HelpfulResult> {
  return (await api.post<HelpfulResult>(`/reviews/${reviewId}/helpful`)).data;
}

/**
 * The seller answers a review of their own listing, once, publicly.
 *
 * A separate endpoint from the edit above on purpose: it is a different
 * permission (owning the *product*, not the review) and it can never change the
 * customer's rating or words.
 */
export async function replyToReview(reviewId: number, body: string): Promise<Review> {
  return (await api.post<Review>(`/reviews/${reviewId}/reply`, { body })).data;
}

/* ------------------------------- moderation -------------------------------- */

/** The admin queue, filterable by status and star rating. */
export async function getModerationQueue(filters: ReviewListFilters = {}): Promise<ReviewListResponse> {
  const suffix = listQueryString(filters);
  const result = await api.get<Review[]>(`/reviews/moderation${suffix}`);
  return { items: result.data, pagination: fallbackPagination(result.pagination, result.data.length) };
}

/**
 * Hide or restore a review.
 *
 * Restoring is the same endpoint with a different status rather than a separate
 * "unmoderate" route: nothing about the review itself changed while it was
 * hidden, so it is one state, not two features.
 */
export async function setReviewModeration(reviewId: number, status: ReviewStatus): Promise<Review> {
  return (await api.patch<Review>(`/reviews/${reviewId}/moderation`, { status })).data;
}

/** Remove a review outright. The destructive sibling of hiding. */
export async function deleteReviewAsModerator(reviewId: number): Promise<{ deleted: boolean }> {
  return (await api.delete<{ deleted: boolean }>(`/reviews/${reviewId}/moderation`)).data;
}
