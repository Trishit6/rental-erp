import { useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewSummaryPanel } from "./ReviewSummary";
import { ActiveFilterSummary, ReviewFilters } from "./ReviewFilters";
import { ReviewList } from "./ReviewList";
import { ReviewForm } from "./ReviewForm";
import {
  ReviewsEmptyState,
  ReviewsErrorState,
  ReviewsFilteredEmptyState,
  ReviewsSkeleton,
} from "./ReviewStates";
import {
  applyReviewFilter,
  hasActiveReviewFilters,
  parseReviewFilters,
  reviewSearchParams,
} from "./schema";
import { useProductReviews } from "../query";
import type { Review } from "../types";

/**
 * The product page's review section.
 *
 * ## Filters live in the URL
 *
 * `?rating=2&sort=helpful` is read with `parseReviewFilters` and written back as
 * a search object, so "show me the one-star reviews, most helpful first" is a
 * shareable link, survives a reload, and gives the browser's back button
 * something to step through. The section owns *no* filter state of its own —
 * which is why `applyReviewFilter` resets the page: narrowing a filter while
 * sitting on page 7 is how someone lands on an empty page and concludes the
 * reviews are gone.
 *
 * `useSearch({ strict: false })` rather than `from: "/product/$slug"` on purpose:
 * the product route deliberately declares no `validateSearch`, so claiming the
 * route's search here would add a URL contract to a page that has no other use
 * for one. The parser is the same tolerant one, so a hand-edited or mistyped
 * parameter degrades to the default instead of throwing.
 *
 * ## One request, three consistent answers
 *
 * The list, the aggregate summary and "may I write one?" arrive together, so the
 * average can never disagree with the rows below it, and the Write button appears
 * exactly when the server would accept the submission.
 */
export function ReviewSection({ productIdOrSlug }: { productIdOrSlug: string }) {
  const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Review | null>(null);

  // Parsed, never trusted: `useSearch` without a validator hands back raw values
  // (and JSON-parsed numbers, since TanStack parses the query string).
  const filters = useMemo(() => parseReviewFilters(rawSearch), [rawSearch]);
  const reviews = useProductReviews(productIdOrSlug, filters);

  function push(next: ReturnType<typeof applyReviewFilter>) {
    void navigate({
      to: "/product/$slug",
      params: { slug: productIdOrSlug },
      search: reviewSearchParams(next),
      replace: true,
    });
  }

  function setFilters(patch: Partial<Omit<typeof filters, "page">>) {
    push(applyReviewFilter(filters, patch));
  }

  const eligibility = reviews.data?.eligibility ?? null;
  const summary = reviews.data?.summary;
  const items = reviews.data?.items ?? [];
  const pagination = reviews.data?.pagination;
  const narrowing = hasActiveReviewFilters(filters);

  return (
    // `id="reviews"` is the target of the header rating link in `ProductInfo`,
    // so "4.8" beside the title jumps straight to the reviews it refers to.
    <section id="reviews" aria-labelledby="reviews-heading" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reviews-heading" className="font-heading text-lg font-extrabold">
          Reviews
        </h2>

        {eligibility?.canReview && !composing && !editing && (
          <Button size="sm" onClick={() => setComposing(true)}>
            <MessageSquarePlus size={14} aria-hidden />
            Write a Review
          </Button>
        )}
      </div>

      {reviews.isPending && <ReviewsSkeleton />}

      {reviews.isError && (
        <ReviewsErrorState onRetry={() => void reviews.refetch()} isPending={reviews.isFetching} />
      )}

      {reviews.isSuccess && summary && (
        <>
          <ReviewSummaryPanel
            summary={summary}
            activeRating={filters.rating}
            onSelectRating={(rating) => setFilters({ rating })}
          />

          <ReviewFilters
            filters={filters}
            onChange={setFilters}
            purchaseCounts={{ purchase: summary.purchaseCount, rental: summary.rentalCount }}
          />
          <ActiveFilterSummary filters={filters} onChange={setFilters} />

          {composing && eligibility?.orderItemId && eligibility.purchaseType && (
            <ReviewForm
              orderItemId={eligibility.orderItemId}
              purchaseType={eligibility.purchaseType}
              onDone={() => setComposing(false)}
              onCancel={() => setComposing(false)}
            />
          )}

          {editing?.orderItemId && (
            <ReviewForm
              orderItemId={editing.orderItemId}
              purchaseType={editing.purchaseType}
              editing={editing}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          )}

          <ReviewList
            reviews={items}
            page={pagination?.page ?? filters.page}
            totalPages={pagination?.totalPages ?? 1}
            total={pagination?.total ?? items.length}
            onPageChange={(page) => push({ ...filters, page })}
            isFetching={reviews.isFetching}
            onEdit={(review) => {
              setComposing(false);
              setEditing(review);
            }}
            emptyState={
              narrowing ? (
                <ReviewsFilteredEmptyState
                  onClear={() => setFilters({ rating: null, purchaseType: null })}
                />
              ) : (
                <ReviewsEmptyState eligibility={eligibility} onWrite={() => setComposing(true)} />
              )
            }
          />
        </>
      )}
    </section>
  );
}
