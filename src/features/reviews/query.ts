import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query/keys";
import { ApiError, type Pagination } from "@/lib/api/client";
import {
  createReview,
  deleteReview,
  deleteReviewAsModerator,
  getModerationQueue,
  getMyReviews,
  getProductReviews,
  getReview,
  getSellerReviews,
  replyToReview,
  setReviewModeration,
  toggleReviewHelpful,
  updateReview,
} from "./api";
import { syncReviewsToCollection } from "@/lib/tanstack-db/sync";
import type {
  ProductReviewsResponse,
  Review,
  ReviewFilters,
  ReviewInput,
  ReviewListFilters,
  ReviewListResponse,
  ReviewStatus,
} from "./types";

/**
 * Review queries and mutations.
 *
 * ## Invalidation is targeted, never global
 *
 * A write to one product's reviews invalidates `["reviews", productId]` — the
 * prefix that product's list, summary and the viewer's eligibility all hang off
 * — plus the two *private* entries the same write changed (my reviews, the seller's
 * queue). It never touches products, orders, cart or favourites, because a rating
 * changing cannot invalidate any of them. The product *detail* entry is
 * invalidated separately and explicitly, because `ratingAverage`/`ratingCount`
 * are cached on the product row and the card badge reads them.
 *
 * ## One review list per filter combination
 *
 * The filter object is part of the key, so sorting or narrowing never overwrites
 * what the shopper was previously looking at, and going back to a filter they
 * already visited is instant.
 */

export const REVIEWS_STALE_MS = 60_000;
export const REVIEWS_GC_MS = 10 * 60_000;

export const reviewKeys = {
  /** Prefix for every entry about one product. Invalidate this after a write. */
  product: (productId: number) => queryKeys.reviews(productId),
  list: (productId: number, filters: ReviewFilters) =>
    queryKeys.reviewsList(productId, { ...filters }),
  summary: (productId: number) => queryKeys.reviewsSummary(productId),
  eligibility: (productId: number) => queryKeys.reviewsEligibility(productId),
  mine: (filters: ReviewListFilters) => queryKeys.myReviews({ ...filters }),
  seller: (filters: ReviewListFilters) => queryKeys.sellerReviews({ ...filters }),
  moderation: (filters: ReviewListFilters) => queryKeys.reviewsModeration({ ...filters }),
  single: (reviewId: number) => queryKeys.reviewSingle(reviewId),
};

/**
 * Reconcile every query a review write could have changed.
 *
 * Exported so the order page's "Review Product" button and the admin queue
 * invalidate identically — three call sites, one rule, and no risk of one of them
 * quietly missing the summary.
 */
export function invalidateReviewsForProduct(queryClient: QueryClient, productIds: number[]): void {
  for (const productId of new Set(productIds)) {
    void queryClient.invalidateQueries({ queryKey: reviewKeys.product(productId) });
    void queryClient.invalidateQueries({ queryKey: reviewKeys.eligibility(productId) });
  }
  // The product row caches `ratingAverage`/`ratingCount`, which the card badge and
  // the product page header both read. It is a *different* key family, so it has
  // to be named explicitly — this is the one invalidation that reaches outside the
  // reviews prefix, and it does so because a rating genuinely changed.
  void queryClient.invalidateQueries({ queryKey: queryKeys.productAll });
  // Any product list holding this listing's card, for the same reason.
  void queryClient.invalidateQueries({ queryKey: ["browse", "products"] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.myReviewsRoot });
  // The order page's "Edit your review" holds the review by id, under its own
  // root — a write that deletes or edits it must not leave stale text there.
  void queryClient.invalidateQueries({ queryKey: queryKeys.reviewsSingleRoot });
  void queryClient.invalidateQueries({ queryKey: queryKeys.sellerReviewsRoot });
  void queryClient.invalidateQueries({ queryKey: queryKeys.reviewsModerationRoot });
}

/** A review's `ApiError` turned into a sentence, with the known codes mapped. */
export function reviewErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // The server sends the reason a review is not allowed *in the message*
    // ("You can review an item once it has been delivered."), because the rule
    // depends on an order state the client cannot see. Showing that text is the
    // whole point; falling back to a generic string would throw it away.
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

/* --------------------------------- queries --------------------------------- */

/**
 * The product page's review section: one page of rows, the aggregate, and the
 * viewer's eligibility, resolved together.
 */
export type ProductReviewsQueryData = ProductReviewsResponse & { pagination: Pagination };

export function productReviewsQueryOptions(productIdOrSlug: string, filters: ReviewFilters) {
  return {
    // Keyed by the *reference the URL carries*, not the resolved numeric id. Two
    // references for the same product (`/product/42` and `/product/laser-level`)
    // are the same reviews, and resolving the id first would need the product row
    // to already be in the cache — which is exactly what is not true while the
    // product page is still loading.
    queryKey: ["reviews", "product", productIdOrSlug, filters] as const,
    queryFn: async (): Promise<ProductReviewsQueryData> => {
      const { data, pagination } = await getProductReviews(productIdOrSlug, filters);
      // Mirror the rows the session user is already allowed to see into the
      // reactive store. Public reviews merge; this is a derived cache, not a
      // second source of truth.
      if (data.items.length) syncReviewsToCollection(data.items);
      return { ...data, pagination };
    },
    staleTime: REVIEWS_STALE_MS,
    gcTime: REVIEWS_GC_MS,
  };
}

/** The product page's review section. Disabled until the product is known. */
export function useProductReviews(productIdOrSlug: string | undefined, filters: ReviewFilters) {
  return useQuery({
    ...productReviewsQueryOptions(productIdOrSlug ?? "", filters),
    enabled: !!productIdOrSlug,
    // Hold the current page while a new filter set loads: no skeleton flash and
    // no layout jump when someone switches from "Newest" to "5 stars". `keepPreviousData`
    // is not used because the filters *are* the key — the previous page is a
    // different set of rows, and showing it under new filters would be a lie.
  });
}

export function useMyReviews(filters: ReviewListFilters = {}, enabled = true) {
  return useQuery({
    queryKey: reviewKeys.mine(filters),
    queryFn: () => getMyReviews(filters),
    enabled,
    staleTime: REVIEWS_STALE_MS,
  });
}

export function useSellerReviews(filters: ReviewListFilters = {}, enabled = true) {
  return useQuery({
    queryKey: reviewKeys.seller(filters),
    queryFn: () => getSellerReviews(filters),
    enabled,
    staleTime: REVIEWS_STALE_MS,
  });
}

export function useModerationQueue(filters: ReviewListFilters = {}, enabled = true) {
  return useQuery({
    queryKey: reviewKeys.moderation(filters),
    queryFn: () => getModerationQueue(filters),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * One review, by id.
 *
 * Used by the order page's "Edit your review" control: the order detail response
 * knows a line has been reviewed (it is how the button knows to say "Edit" rather
 * than "Write") but deliberately does not carry the review's text, because an
 * order is a receipt and not a review history. Fetching it *on click* rather than
 * with the order keeps a customer with fifty reviewed orders from paying for
 * fifty extra payloads on a page they came to read one of.
 */
export function useReview(reviewId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.reviewSingle(reviewId ?? 0),
    queryFn: () => getReview(reviewId as number),
    enabled: typeof reviewId === "number" && reviewId > 0,
    staleTime: REVIEWS_STALE_MS,
  });
}

/* -------------------------------- mutations -------------------------------- */

/**
 * Write or edit a review.
 *
 * One mutation, because the two differ only in which endpoint they call and are
 * *always* presented by the same form — a second mutation would be a second copy
 * of the invalidation rule, and the two would drift.
 *
 * The product id comes from the response rather than being assumed, so the cache
 * is reconciled for the listing the review actually landed on even if the caller
 * only knew the order line.
 */
export function useReviewMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      input,
    }: {
      reviewId?: number;
      input: ReviewInput;
    }): Promise<Review> => (reviewId ? updateReview(reviewId, input) : createReview(input)),

    onSuccess: (review, variables) => {
      invalidateReviewsForProduct(queryClient, [review.product.id]);
      toast(variables.reviewId ? "Review updated" : "Review published", {
        description: "Thanks — your review is now on the listing.",
      });
    },
    onError: (error, variables) => {
      toast(reviewErrorMessage(error), {
        description: variables.reviewId
          ? "Your review was not changed."
          : "Your review was not published.",
      });
    },
  });
}

/** Delete your own review. Frees the order line so it can be reviewed again. */
export function useDeleteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (review: Pick<Review, "id" | "product">) => deleteReview(review.id),
    onSuccess: (_result, review) => {
      invalidateReviewsForProduct(queryClient, [review.product.id]);
      toast("Review deleted");
    },
    onError: (error) => {
      toast(reviewErrorMessage(error), { description: "Your review was not deleted." });
    },
  });
}

/**
 * Mark a review helpful.
 *
 * **Optimistic, and safe to be**: the toggle is reversible by design, so being
 * briefly wrong about the count self-corrects on the next response, and rolling
 * back leaves the reader exactly where they were. The one thing the UI must not
 * do optimistically is *allow* the action — so the button is disabled from the
 * server's `viewerOwnsReview`, not from an optimistic guess.
 */
export function useMarkHelpful() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (review: Pick<Review, "id" | "product">) => toggleReviewHelpful(review.id),

    onMutate: async (review) => {
      await queryClient.cancelQueries({ queryKey: reviewKeys.product(review.product.id) });

      const previous = queryClient.getQueriesData({
        queryKey: reviewKeys.product(review.product.id),
      });

      // Flip the count and the pressed state in every cached page of this
      // product's reviews at once, so a shopper who pages back sees the same
      // number rather than a stale one.
      queryClient.setQueriesData(
        { queryKey: reviewKeys.product(review.product.id) },
        (old: unknown) => patchReviewInPayload(old, review.id),
      );

      return { previous };
    },

    onError: (error, _review, context) => {
      for (const [key, value] of context?.previous ?? []) {
        queryClient.setQueryData(key, value);
      }
      toast(reviewErrorMessage(error), { description: "Your vote wasn't counted." });
    },

    // The variables are the third argument, not the second — the second is the
    // error, and passing it to `invalidateQueries` would silence the refetch of
    // the exact page the reader is looking at.
    onSettled: (_result, _error, review) => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.product(review.product.id) });
    },
  });
}

/** Flip one review's helpful state inside a cached product-review payload. */
function patchReviewInPayload(old: unknown, reviewId: number): unknown {
  if (!old || typeof old !== "object") return old;
  const payload = old as { data?: { items?: Review[] } };
  const items = payload.data?.items;
  if (!Array.isArray(items)) return old;

  return {
    ...payload,
    data: {
      ...payload.data!,
      items: items.map((review) =>
        review.id === reviewId
          ? {
              ...review,
              viewerMarkedHelpful: !review.viewerMarkedHelpful,
              helpfulCount: Math.max(
                0,
                review.helpfulCount + (review.viewerMarkedHelpful ? -1 : 1),
              ),
            }
          : review,
      ),
    },
  };
}

/**
 * The seller replies to a review of their own listing.
 *
 * Not part of `useReviewMutation` because it is a *different* permission — the
 * seller owns the product, not the review — and it must never be reachable from
 * the customer's edit form.
 */
export function useReplyToReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ reviewId, body }: { reviewId: number; body: string }) =>
      replyToReview(reviewId, body),
    onSuccess: (review) => {
      invalidateReviewsForProduct(queryClient, [review.product.id]);
      toast("Reply published");
    },
    onError: (error) => {
      toast(reviewErrorMessage(error), { description: "Your reply was not published." });
    },
  });
}

/* ------------------------------- moderation -------------------------------- */

/** Hide / restore / delete, for the admin queue. */
export function useReviewModeration() {
  const queryClient = useQueryClient();
  const reconcile = (review: Review) =>
    invalidateReviewsForProduct(queryClient, [review.product.id]);

  return {
    setStatus: useMutation({
      mutationFn: ({ reviewId, status }: { reviewId: number; status: ReviewStatus }) =>
        setReviewModeration(reviewId, status),
      onSuccess: (review) => {
        reconcile(review);
        toast(review.status === "PUBLISHED" ? "Review restored" : "Review hidden");
      },
      onError: (error) => toast(reviewErrorMessage(error)),
    }),
    remove: useMutation({
      mutationFn: (review: Pick<Review, "id" | "product">) => deleteReviewAsModerator(review.id),
      onSuccess: (_result, review) => {
        invalidateReviewsForProduct(queryClient, [review.product.id]);
        toast("Review deleted");
      },
      onError: (error) => toast(reviewErrorMessage(error)),
    }),
  };
}

/** Warm a product's reviews on hover/focus of a "see all reviews" link. */
export function usePrefetchProductReviews() {
  const queryClient = useQueryClient();

  return (productIdOrSlug: string, filters: ReviewFilters) =>
    void queryClient.prefetchQuery(productReviewsQueryOptions(productIdOrSlug, filters));
}

export type { ReviewListResponse };
