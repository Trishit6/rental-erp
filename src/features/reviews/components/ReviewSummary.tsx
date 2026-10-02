import { MessageSquareQuote } from "lucide-react";
import { RatingStars } from "./RatingStars";
import { RatingBreakdown } from "./RatingBreakdown";
import { reviewCountLabel, sharePercent } from "./schema";
import type { RatingSummary } from "../types";

/**
 * The rating summary block: average, total, five-star share and the breakdown.
 *
 * Every number here comes from the server's aggregation, never from the page of
 * reviews that happens to be loaded — filtering to "1 star" must not make the
 * average become 1.0. That is why this takes a `summary` object rather than an
 * array of reviews: the shape makes the mistake impossible to write.
 *
 * The five-bucket breakdown is a filter control, so the whole summary is the
 * entry point to the list below it.
 */
export function ReviewSummaryPanel({
  summary,
  activeRating,
  onSelectRating,
  loading = false,
}: {
  summary: RatingSummary;
  activeRating?: number | null;
  onSelectRating?: (rating: number | null) => void;
  loading?: boolean;
}) {
  const hasReviews = summary.count > 0;

  if (loading) {
    return <ReviewSummarySkeleton />;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="text-center sm:text-left">
        <p className="font-heading text-4xl font-extrabold tabular-nums">
          {hasReviews ? summary.average.toFixed(1) : "—"}
        </p>
        <RatingStars
          value={summary.average}
          size={16}
          className="mt-1.5"
          label={hasReviews ? `Average rating ${summary.average} out of 5` : "Not yet rated"}
        />
        <p className="mt-1 text-xs text-muted-foreground">{reviewCountLabel(summary.count)}</p>
        {hasReviews && (
          <p className="mt-0.5 text-[11px] font-semibold text-primary">
            {sharePercent(summary.fiveStarShare)}% rated 5 stars
          </p>
        )}
      </div>

      {hasReviews ? (
        <RatingBreakdown
          distribution={summary.distribution}
          total={summary.count}
          activeRating={activeRating}
          onSelect={onSelectRating}
        />
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquareQuote size={15} aria-hidden />
          No reviews yet — be the first to share your experience.
        </p>
      )}
    </div>
  );
}

/** Matches the real layout's shape, so nothing jumps when the numbers arrive. */
export function ReviewSummarySkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center" aria-hidden>
      <div className="space-y-2">
        <div className="h-10 w-16 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />
        <div className="h-4 w-20 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        <div className="h-3 w-24 animate-pulse rounded bg-black/5 dark:bg-white/5" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="h-3 animate-pulse rounded bg-black/5 dark:bg-white/5" />
        ))}
      </div>
    </div>
  );
}
