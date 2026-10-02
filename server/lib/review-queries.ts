import { asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { reviews } from "../schema";

/**
 * Review query vocabulary.
 *
 * Everything a review list can be filtered, sorted or paginated by is decided
 * here, in one place, for the same reason `order-queries.ts` owns the order
 * vocabulary: the filter UI must not offer a value the database can never match,
 * and a value written by a future feature must still render rather than blank.
 *
 * Three rules this module exists to hold:
 *
 *  1. **The server decides what is verified.** `REVIEW_PURCHASE_TYPES` is
 *     derived from which row a review points at, and eligibility is a function
 *     of an order's state — never a field the browser is allowed to send.
 *  2. **Sorting and filtering happen in SQL.** A product with thousands of
 *     reviews must never be shipped whole to be ranked in the browser; the
 *     sort keys below map straight onto `ORDER BY`.
 *  3. **Only published reviews are public.** `HIDDEN` is a moderation state a
 *     customer must not be able to route around by adding a filter.
 */

/** Moderation states. Mirrored on the client in `src/features/reviews/types.ts`. */
export const REVIEW_STATUSES = ["PUBLISHED", "HIDDEN", "PENDING"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** States that may appear in any public read of reviews. */
export const PUBLIC_REVIEW_STATUSES: readonly ReviewStatus[] = ["PUBLISHED"];

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === "string" && (REVIEW_STATUSES as readonly string[]).includes(value);
}

/** What kind of transaction the review is about. */
export const REVIEW_PURCHASE_TYPES = ["PURCHASE", "RENTAL"] as const;
export type ReviewPurchaseType = (typeof REVIEW_PURCHASE_TYPES)[number];

export function isReviewPurchaseType(value: unknown): value is ReviewPurchaseType {
  return (
    typeof value === "string" && (REVIEW_PURCHASE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Sorts the product page and the seller's view offer. Every one of them is an
 * indexable expression, so "Most Relevant" and "Most Helpful" are not two
 * different in-browser sorts of the same rows.
 */
export const REVIEW_SORTS = [
  "relevant",
  "newest",
  "highest",
  "lowest",
  "helpful",
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export function isReviewSort(value: unknown): value is ReviewSort {
  return typeof value === "string" && (REVIEW_SORTS as readonly string[]).includes(value);
}

/** Star values, for the rating filter chips. */
export const REVIEW_RATINGS = [5, 4, 3, 2, 1] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

/**
 * Order states that make a *purchase* reviewable.
 *
 * Reads `DELIVERED`/`COMPLETED` from the existing order vocabulary rather than
 * inventing a "reviewed" flag on the order: the review is written after the
 * goods arrived, and that is exactly the state the order is already in.
 * `PAID` is legacy and deliberately excluded — a paid-but-undelivered order is
 * not something the customer has experienced yet.
 */
export const REVIEWABLE_ORDER_STATUSES: readonly string[] = ["DELIVERED", "COMPLETED"];

/**
 * Rental states that make a *rental* reviewable.
 *
 * A rental is judged on how it came back, not on how it went out, so `RETURNED`
 * and `COMPLETED` are the reviewable states — from `server/lib/rental-lifecycle.ts`,
 * which owns that vocabulary. `OVERDUE` is deliberately excluded: the customer
 * has not finished with the item, and a review written mid-dispute is not a
 * settled opinion.
 */
export const REVIEWABLE_RENTAL_STATUSES: readonly string[] = ["RETURNED", "COMPLETED"];

/**
 * List query. Coerced and `.catch()`-guarded rather than strict, because these
 * arrive as query strings: an unknown sort or a nonsense page must degrade to a
 * usable list, not a route-level 400 over a mistyped URL.
 */
export const reviewsListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(10).default(10),
  // `nullish().catch(null)` rather than `.optional()`: a catch needs a default of
  // the field's own output type, and "no rating filter" is null as much as
  // undefined here.
  rating: z.coerce.number().int().min(1).max(5).nullish().catch(null),
  purchaseType: z.string().trim().nullish().catch(null),
  sort: z.string().trim().nullish().catch(null),
});

export type ReviewsListQuery = z.infer<typeof reviewsListQuerySchema>;

export type ResolvedReviewFilters = {
  page: number;
  pageSize: number;
  rating: number | null;
  purchaseType: ReviewPurchaseType | null;
  sort: ReviewSort;
};

export function resolveReviewFilters(raw: unknown): ResolvedReviewFilters {
  const parsed = reviewsListQuerySchema.parse(raw ?? {});

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    rating: typeof parsed.rating === "number" ? parsed.rating : null,
    purchaseType: isReviewPurchaseType(parsed.purchaseType) ? parsed.purchaseType : null,
    sort: isReviewSort(parsed.sort) ? parsed.sort : "relevant",
  };
}

/**
 * The public half of a review list's WHERE clause: one product, published rows.
 *
 * Deliberately *not* parameterised by status — public reads can only ever see
 * published reviews, so there is no filter a client could send to widen that.
 */
export function buildReviewPublicFilters(input: {
  productId: number;
  rating?: number | null;
  purchaseType?: ReviewPurchaseType | null;
}): SQL[] {
  const conditions: SQL[] = [
    eq(reviews.productId, input.productId),
    inArray(reviews.status, [...PUBLIC_REVIEW_STATUSES]),
  ];

  if (typeof input.rating === "number") {
    conditions.push(eq(reviews.rating, input.rating));
  }
  if (input.purchaseType) {
    conditions.push(eq(reviews.purchaseType, input.purchaseType));
  }

  return conditions;
}

/**
 * Review ordering.
 *
 * `helpful` and `highest`/`lowest` all fall back to recency so that pages stay
 * deterministic: without a tiebreak, two reviews sharing a score can swap places
 * between requests and page 2 repeats a row from page 1.
 *
 * "Most Relevant" is the honest name for what marketplaces mean by it: verified
 * transactions first, then the ones other customers found useful, then recency.
 * It is not a machine-learned ranking, so nothing pretends to be personalised.
 */
export function buildReviewSort(sort: ReviewSort): SQL[] {
  switch (sort) {
    case "newest":
      return [desc(reviews.createdAt), desc(reviews.id)];
    case "highest":
      return [desc(reviews.rating), desc(reviews.helpfulCount), desc(reviews.id)];
    case "lowest":
      return [asc(reviews.rating), desc(reviews.helpfulCount), desc(reviews.id)];
    case "helpful":
      return [desc(reviews.helpfulCount), desc(reviews.createdAt), desc(reviews.id)];
    case "relevant":
    default:
      return [
        desc(reviews.isVerifiedPurchase),
        desc(reviews.helpfulCount),
        desc(reviews.createdAt),
        desc(reviews.id),
      ];
  }
}

/**
 * Whether an order line can carry a review *right now*.
 *
 * Pure, and the single place the rule lives, so the "Review Product" button on
 * the order page and the `POST /reviews` guard can never disagree about who is
 * eligible. The reason it returns is what the API sends back, so a refusal is a
 * sentence a person can act on rather than a bare 403.
 */
export function checkReviewEligibility(input: {
  purchaseType: ReviewPurchaseType;
  orderStatus: string | null | undefined;
  rentalStatus: string | null | undefined;
  alreadyReviewed: boolean;
}): { eligible: true } | { eligible: false; code: string; message: string } {
  const { purchaseType, orderStatus, rentalStatus, alreadyReviewed } = input;

  if (alreadyReviewed) {
    return {
      eligible: false,
      code: "ALREADY_REVIEWED",
      message: "You've already reviewed this item.",
    };
  }

  if (purchaseType === "RENTAL") {
    if (!rentalStatus) {
      return {
        eligible: false,
        code: "REVIEW_NOT_ELIGIBLE",
        message: "This rental isn't finished yet, so it can't be reviewed.",
      };
    }
    if (!REVIEWABLE_RENTAL_STATUSES.includes(rentalStatus)) {
      return {
        eligible: false,
        code: "REVIEW_NOT_ELIGIBLE",
        message: "You can review a rental once it has been returned.",
      };
    }
    return { eligible: true };
  }

  if (!orderStatus) {
    return {
      eligible: false,
      code: "REVIEW_NOT_ELIGIBLE",
      message: "This order isn't finished yet, so it can't be reviewed.",
    };
  }
  if (!REVIEWABLE_ORDER_STATUSES.includes(orderStatus)) {
    return {
      eligible: false,
      code: "REVIEW_NOT_ELIGIBLE",
      message: "You can review an item once it has been delivered.",
    };
  }
  return { eligible: true };
}

/**
 * The purchase type a review *must* carry, given what the review points at.
 *
 * A rental line implies a rental review and a purchase line implies a purchase
 * review, so the type is a consequence of the row the server resolved — the one
 * case where the client is not asked, because there is nothing to ask.
 */
export function purchaseTypeForLine(input: {
  mode: string | null | undefined;
  rentalId: number | null | undefined;
}): ReviewPurchaseType {
  if (input.rentalId) return "RENTAL";
  return input.mode === "RENT" ? "RENTAL" : "PURCHASE";
}

/**
 * Reviewer images: a JSON array of storage URLs, capped and host-checked.
 *
 * A `text` column of JSON for the same reason `products.specifications` is one:
 * the images are always read as a set with the review, never queried, filtered
 * or joined on. A child table would add a join to every review read to buy
 * nothing. The array is validated on write *and* on read, because a malformed
 * value must degrade to "no photos" rather than throw while rendering a page.
 */
export const MAX_REVIEW_IMAGES = 4;

export function parseReviewImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string").slice(0, MAX_REVIEW_IMAGES);
  } catch {
    return [];
  }
}

/**
 * Reviewer photo URLs must be served by a host this deployment already trusts —
 * the configured bucket or Unsplash. Without the check, a review could point at
 * an arbitrary host, which turns a product page into a request for third-party
 * content nobody vetted (and a beacon under the reviewer's control).
 *
 * The rule itself lives in `lib/image-urls.ts` because the seller's product form
 * accepts URLs on exactly the same terms; this name is kept so the review rules
 * keep reading as one module.
 */
export { imageUrlError as reviewImageUrlError } from "./image-urls";

/** Narrowing helper for the reviewer's own review rows. */
export function reviewBelongsTo(userId: number, review: { userId: number }): boolean {
  return review.userId === userId;
}

/**
 * Product rating aggregation.
 *
 * The average, the count and the five-bucket distribution all come from the
 * database in two indexed queries — never from the rows a page happens to have
 * loaded. `products.ratingAverage` / `ratingCount` are refreshed on write from
 * this same aggregation, so the badge on a card and the summary on the product
 * page can never disagree.
 *
 * Only published reviews count. Including hidden ones would let a moderator's
 * decision silently keep inflating a public average.
 */
export function ratingSummaryShape(ratingAverage: number, count: number): { average: number; count: number } {
  return {
    average: count > 0 ? Number(ratingAverage.toFixed(2)) : 0,
    count,
  };
}

/**
 * The projection every review read shares, so no two endpoints invent their own
 * row shape and a card can be rendered from any of them.
 */
export const reviewColumns = {
  id: reviews.id,
  userId: reviews.userId,
  productId: reviews.productId,
  sellerId: reviews.sellerId,
  orderId: reviews.orderId,
  orderItemId: reviews.orderItemId,
  rentalId: reviews.rentalId,
  purchaseType: reviews.purchaseType,
  rating: reviews.rating,
  title: reviews.title,
  comment: reviews.comment,
  isVerifiedPurchase: reviews.isVerifiedPurchase,
  status: reviews.status,
  isEdited: reviews.isEdited,
  helpfulCount: reviews.helpfulCount,
  images: reviews.images,
  sellerReply: reviews.sellerReply,
  sellerRepliedAt: reviews.sellerRepliedAt,
  createdAt: reviews.createdAt,
  updatedAt: reviews.updatedAt,
} as const;
