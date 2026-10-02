import { z } from "zod";
import {
  DEFAULT_REVIEW_FILTERS,
  REVIEW_RATINGS,
  REVIEW_SORTS,
  type ReviewFilters,
  type ReviewPurchaseType,
  type ReviewSort,
} from "../types";

/**
 * Review form validation and list-state helpers.
 *
 * Everything here is pure so the rules can be unit-tested without rendering a
 * form, and so the same functions serve the product page's section, the order
 * page's "Review Product" button and the "My Reviews" page — three surfaces that
 * must not disagree about what a valid review is.
 *
 * ## The client is not the security boundary
 *
 * These schemas shape what a person experiences (a counter under the textarea, a
 * disabled submit button). The server re-validates every field independently and
 * — for the fields that matter most — refuses to accept them at all. `isVerifiedPurchase`,
 * `userId`, `sellerId` and `status` are not in `reviewFormSchema` precisely so
 * that a client which sends them gets a 400 rather than a silently ignored key.
 */

/** Longest title the column accepts (mirrors `reviews.title` varchar(120)). */
export const REVIEW_TITLE_MAX = 120;
/** Longest comment the column accepts (`reviews.comment` is a TEXT). */
export const REVIEW_COMMENT_MAX = 2000;
/** Shortest comment that is still useful to another shopper. */
export const REVIEW_COMMENT_MIN = 10;
/** How many photos one review may carry (mirrors the server's cap). */
export const REVIEW_IMAGES_MAX = 4;

export const ratingSchema = z
  .number({ message: "Choose a rating from 1 to 5 stars." })
  .int()
  .min(1, "Choose at least 1 star.")
  .max(5, "A review can be at most 5 stars.");

export const reviewTitleSchema = z
  .string()
  .trim()
  .max(REVIEW_TITLE_MAX, `Keep the title under ${REVIEW_TITLE_MAX} characters.`)
  // An empty title is allowed and stored as null — the description carries the
  // review on its own, and forcing a headline would be inventing a rule.
  .optional()
  .or(z.literal(""));

export const reviewCommentSchema = z
  .string()
  .trim()
  .min(REVIEW_COMMENT_MIN, `Tell other people a little more — at least ${REVIEW_COMMENT_MIN} characters.`)
  .max(REVIEW_COMMENT_MAX, `Keep it under ${REVIEW_COMMENT_MAX} characters.`);

export const reviewImagesSchema = z
  .array(z.string().url("That image address isn't valid."))
  .max(REVIEW_IMAGES_MAX, `A review can carry up to ${REVIEW_IMAGES_MAX} photos.`);

/**
 * The review form.
 *
 * `orderItemId` is required on create and optional on edit: an edit already
 * points at a review, and re-sending the line would let a client try to move a
 * review onto a different order. The server ignores it on `PATCH` regardless.
 */
export const reviewFormSchema = z
  .object({
    orderItemId: z.number().int().positive().optional(),
    rating: ratingSchema,
    title: reviewTitleSchema,
    comment: reviewCommentSchema,
    images: reviewImagesSchema.default([]),
  })
  .superRefine((value, ctx) => {
    if (value.orderItemId === undefined) return;
    if (value.orderItemId <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["orderItemId"], message: "Invalid order line." });
    }
  });

export type ReviewFormValues = z.infer<typeof reviewFormSchema>;

/** Field-level messages, keyed by form field, for inline rendering. */
export type ReviewFieldErrors = Partial<Record<keyof ReviewFormValues, string>>;

/**
 * Turn a zod failure into one message per field.
 *
 * Only the *first* issue per field is surfaced: showing a stack of messages
 * under one input is noise, and the first is always the most specific.
 */
export function reviewFieldErrors(error: z.ZodError): ReviewFieldErrors {
  const errors: ReviewFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof ReviewFormValues | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** Whether the form may be submitted. Mirrors the server's minimums exactly. */
export function isReviewFormValid(values: Partial<ReviewFormValues>): boolean {
  return reviewFormSchema.safeParse(values).success;
}

/* --------------------------------- filters --------------------------------- */

/**
 * Parse filter state out of the URL.
 *
 * `?rating=4&purchaseType=RENTAL&sort=newest` has to survive a reload and a
 * shared link, and an unrecognised value must degrade to the default rather than
 * throw — the same rule the server applies to the same parameters. Never throws.
 */
export function parseReviewFilters(raw: Record<string, unknown>): ReviewFilters {
  const ratingRaw = Number(raw.rating);
  const rating = (REVIEW_RATINGS as readonly number[]).includes(ratingRaw) ? ratingRaw : null;

  const purchaseTypeRaw = typeof raw.purchaseType === "string" ? raw.purchaseType : "";
  const purchaseType =
    purchaseTypeRaw === "PURCHASE" || purchaseTypeRaw === "RENTAL"
      ? (purchaseTypeRaw as ReviewPurchaseType)
      : null;

  const sortRaw = typeof raw.sort === "string" ? raw.sort : "";
  const sort = (REVIEW_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as ReviewSort)
    : DEFAULT_REVIEW_FILTERS.sort;

  const pageRaw = Number(raw.page);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return { rating, purchaseType, sort, page, pageSize: DEFAULT_REVIEW_FILTERS.pageSize };
}

/** Drop filters that are at their default, so a clean URL stays clean. */
export function reviewSearchParams(filters: ReviewFilters): Record<string, string | number> {
  const search: Record<string, string | number> = {};
  if (filters.rating !== null) search.rating = filters.rating;
  if (filters.purchaseType !== null) search.purchaseType = filters.purchaseType;
  if (filters.sort !== DEFAULT_REVIEW_FILTERS.sort) search.sort = filters.sort;
  if (filters.page > 1) search.page = filters.page;
  return search;
}

/**
 * Merge a filter change, resetting to page 1.
 *
 * Changing the filter while on page 7 of the old result set is how a shopper
 * lands on an empty page and concludes the reviews are gone.
 */
export function applyReviewFilter(
  filters: ReviewFilters,
  patch: Partial<Omit<ReviewFilters, "page">>,
): ReviewFilters {
  return { ...filters, ...patch, page: 1 };
}

/** Whether anything other than the sort is narrowing the list. */
export function hasActiveReviewFilters(filters: ReviewFilters): boolean {
  return filters.rating !== null || filters.purchaseType !== null;
}

/* ------------------------------ review content ----------------------------- */

/** The word shown beside a stars-only rating, so it is never shape alone. */
export function ratingLabel(rating: number): string {
  const rounded = Math.min(5, Math.max(1, Math.round(rating)));
  return `${rounded} ${rounded === 1 ? "star" : "stars"}`;
}

/** "3 reviews" / "1 review" — the one place the plural is decided. */
export function reviewCountLabel(count: number): string {
  return `${count} ${count === 1 ? "review" : "reviews"}`;
}

/** A percentage for a 0–1 share, rounded to a whole number. */
export function sharePercent(share: number): number {
  return Math.round(Math.max(0, Math.min(1, share)) * 100);
}

/**
 * A short author label: first name plus an initial.
 *
 * Reviews are public and a customer's full name is not something this feature
 * needs to republish, so the card shows the friendly half and leaves the rest in
 * the profile. The API only ever sends what the listing already showed.
 */
export function authorDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Revaro customer";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** "Edited" badge text, or null when the review has never been changed. */
export function editedBadge(isEdited: boolean, updatedAt: string, createdAt: string): string | null {
  if (!isEdited) return null;
  // An edit flag with an identical timestamp means only the rating changed, so
  // "Edited" would overstate it; "Rating updated" is the honest label.
  return updatedAt === createdAt ? "Rating updated" : "Edited";
}

/**
 * Whether a reviewer may still act on a review.
 *
 * Ownership comes from the server (`viewerOwnsReview`), never from comparing ids
 * in the browser — a client that guessed an id would find the button rendered
 * and the request refused with a 404.
 */
export function canManageReview(review: { viewerOwnsReview: boolean }): boolean {
  return review.viewerOwnsReview;
}

/** Whether "Mark as helpful" should be offered. */
export function canMarkHelpful(review: { viewerOwnsReview: boolean }): boolean {
  return !review.viewerOwnsReview;
}
