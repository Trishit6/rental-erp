import { MessageSquareQuote, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewSummarySkeleton } from "./ReviewSummary";
import type { ReviewEligibility } from "../types";

/**
 * The review section's loading, empty and error states.
 *
 * All three are shaped like the real section — summary block, then two card
 * outlines — because a skeleton that is a generic spinner where the reviews go
 * makes the page jump twice on load. The card placeholders match the real card's
 * height, so nothing moves when the text arrives.
 *
 * None of these show a raw server message: `reviewsErrorMessage` is the only
 * place an error string is chosen, and it prefers the server's own sentence (the
 * server knows *why* something failed) over a generic apology.
 */

/* -------------------------------- skeleton --------------------------------- */

export function ReviewsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading reviews…</span>
      <ReviewSummarySkeleton />

      <div className="space-y-4">
        {[0, 1].map((row) => (
          <div key={row} className="raised-surface space-y-3 rounded-3xl p-5" aria-hidden>
            <div className="flex items-center gap-3">
              <div className="size-10 animate-pulse rounded-full bg-black/5 dark:bg-white/5" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 animate-pulse rounded bg-black/5 dark:bg-white/5" />
                <div className="h-3 w-20 animate-pulse rounded bg-black/5 dark:bg-white/5" />
              </div>
            </div>
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-black/5 dark:bg-white/5" />
            <div className="h-3 w-full animate-pulse rounded bg-black/5 dark:bg-white/5" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-black/5 dark:bg-white/5" />
            <div className="h-8 w-28 animate-pulse rounded-full bg-black/5 dark:bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- empty ----------------------------------- */

/**
 * "No reviews yet".
 *
 * The call to action is shown **only when the server says this viewer is
 * eligible** — a visitor who has not bought the item is offered the section, not
 * a button that would be refused with a 409. Someone who *has* bought it but is
 * not yet eligible gets the reason instead, because "why can't I review this?"
 * is the question they actually arrived with.
 */
export function ReviewsEmptyState({
  eligibility,
  onWrite,
}: {
  eligibility: ReviewEligibility;
  onWrite?: () => void;
}) {
  const canReview = eligibility?.canReview === true;

  return (
    <div className="inset-surface rounded-3xl px-5 py-10 text-center">
      <span className="soft-button mx-auto flex size-12 items-center justify-center rounded-2xl text-primary">
        <MessageSquareQuote size={20} aria-hidden />
      </span>

      <h3 className="mt-3 font-heading text-lg font-extrabold">No reviews yet</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        {canReview
          ? "Be the first to share your experience with this product."
          : "Nobody has reviewed this item yet. If you buy or rent it, you can be the first."}
      </p>

      {canReview && onWrite && (
        <Button className="mt-4" onClick={onWrite}>
          Write a Review
        </Button>
      )}

      {/* The reason, when there is one — an eligibility refusal is information,
          not an error, and hiding it would send people to the order page to
          guess. */}
      {!canReview && eligibility?.reason && (
        <p className="mt-3 text-xs font-semibold text-muted-foreground">{eligibility.reason}</p>
      )}
    </div>
  );
}

/* --------------------------------- error ----------------------------------- */

export function ReviewsErrorState({
  onRetry,
  isPending = false,
}: {
  onRetry: () => void;
  isPending?: boolean;
}) {
  return (
    <div className="inset-surface rounded-3xl px-5 py-10 text-center" role="alert">
      <h3 className="font-heading text-base font-extrabold">We couldn&rsquo;t load the reviews.</h3>
      <p className="mt-1 text-sm text-muted-foreground">Please try again.</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} disabled={isPending}>
        <RefreshCw size={14} aria-hidden />
        {isPending ? "Retrying…" : "Try Again"}
      </Button>
    </div>
  );
}

/**
 * "You haven't written any reviews yet."
 *
 * Deliberately a different message from the product page's empty state: there is
 * no "be the first to review this" call to action here, because a review cannot
 * be written from a list — it is written against an order line. The instruction
 * therefore points at the order, which is where the button actually lives.
 */
export function MyReviewsEmptyState() {
  return (
    <div className="inset-surface rounded-3xl px-5 py-8 text-center">
      <p className="text-sm font-bold">You haven&rsquo;t written a review yet.</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Once an order is delivered or a rental is returned, you can review the item from the order
        page.
      </p>
    </div>
  );
}

/**
 * "Nothing matched these filters" — a *different* message from "no reviews yet".
 *
 * A product with 200 reviews that someone has filtered to one star must not tell
 * them nobody has reviewed it, and it must not hide the call to action either:
 * clearing the filter is the useful suggestion here, not writing a review.
 */
export function ReviewsFilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="inset-surface rounded-3xl px-5 py-8 text-center">
      <p className="text-sm font-bold">No reviews match these filters.</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
