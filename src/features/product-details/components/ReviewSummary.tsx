import { MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { RatingStars } from "./RatingStars";
import type { ProductReviewSummary } from "../types";

/**
 * Rating summary. The distribution is computed from real reviews, so it is only
 * shown when the API returned some — the reviews feature owns the full list.
 */
export function ReviewSummary({ summary }: { summary: ProductReviewSummary }) {
  const hasReviews = summary.count > 0;

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="raised-surface scroll-mt-24 rounded-3xl p-5"
    >
      <h2 id="reviews-heading" className="font-heading text-lg font-extrabold">
        Reviews
      </h2>

      {!hasReviews ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquareQuote size={15} aria-hidden />
          No reviews yet — be the first to share your experience.
        </p>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="text-center sm:text-left">
            <p className="font-heading text-4xl font-extrabold">{summary.average.toFixed(1)}</p>
            <RatingStars value={summary.average} size={16} className="mt-1.5" />
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.count} {summary.count === 1 ? "review" : "reviews"}
            </p>
          </div>

          <ul className="space-y-1.5">
            {summary.distribution.map((bucket) => (
              <li key={bucket.stars} className="flex items-center gap-2 text-[11px]">
                <span className="w-8 shrink-0 font-semibold tabular-nums">{bucket.stars} ★</span>
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/5"
                  role="presentation"
                >
                  <span
                    className={cn("block h-full rounded-full bg-primary/70")}
                    style={{ width: `${Math.round(bucket.share * 100)}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                  {bucket.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
