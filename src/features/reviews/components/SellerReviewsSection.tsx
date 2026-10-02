import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewCard } from "./ReviewCard";
import { ReviewList } from "./ReviewList";
import { RatingStars } from "./RatingStars";
import { ReviewsErrorState, ReviewsSkeleton } from "./ReviewStates";
import { reviewCountLabel } from "./schema";
import { useSellerReviews } from "../query";
import type { ReviewStatus } from "../types";

/**
 * The seller's own review page — `/dashboard/reviews`.
 *
 * ## Two things this surface is not
 *
 * It is **not** a moderation queue: a seller can answer a review but cannot hide
 * one, because `status` is only writable by an admin. And it is **not** the
 * product page's list: it includes hidden reviews (with their state shown), so a
 * seller who can see that a review was moderated is not left wondering whether it
 * vanished. The scope itself is an `EXISTS` over the seller's own products in
 * SQL — there is no parameter that widens it.
 *
 * The reply composer is rendered inline in each card rather than in a separate
 * panel, because the reply belongs to that review and asking the seller to match
 * rows up by hand is how replies end up on the wrong review.
 */
export function SellerReviewsSection() {
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [page, setPage] = useState(1);

  const query = useSellerReviews({ status, page, pageSize: 10 });

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;
  const stats = query.data?.stats ?? [];
  const statByProduct = new Map(stats.map((stat) => [stat.productId, stat]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title flex items-center gap-2 text-3xl">
            <Store size={20} aria-hidden className="text-primary" />
            Reviews
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What customers said about your listings — and where you can answer them.
          </p>
        </div>

        <div className="flex gap-2" role="group" aria-label="Filter reviews">
          {(
            [
              [null, "All"],
              ["PUBLISHED", "Published"],
              ["HIDDEN", "Hidden"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={label}
              size="sm"
              variant={status === value ? "default" : "secondary"}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {query.isPending && <ReviewsSkeleton />}

      {query.isError && (
        <ReviewsErrorState onRetry={() => void query.refetch()} isPending={query.isFetching} />
      )}

      {query.isSuccess && (
        <ReviewList
          reviews={items}
          page={pagination?.page ?? page}
          totalPages={pagination?.totalPages ?? 1}
          total={pagination?.total ?? items.length}
          onPageChange={setPage}
          isFetching={query.isFetching}
          emptyState={
            <p className="inset-surface rounded-3xl px-5 py-8 text-center text-sm text-muted-foreground">
              No reviews match this filter yet.
            </p>
          }
          renderCard={(review) => (
            <div className="space-y-2">
              <ProductHeading review={review} stat={statByProduct.get(review.product.id)} />
              <ReviewCard review={review} canReply />
            </div>
          )}
        />
      )}
    </div>
  );
}

/**
 * Which listing a review is about, with its live average.
 *
 * The average comes from the `stats` block the same response returned, so the
 * seller sees their listing's real rating without the page firing a request per
 * row.
 */
function ProductHeading({
  review,
  stat,
}: {
  review: { product: { id: number; title: string | null; slug: string | null } };
  stat?: { average: number; count: number };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {review.product.slug ? (
        <Link
          to="/product/$slug"
          params={{ slug: review.product.slug }}
          className="text-sm font-extrabold hover:text-primary"
        >
          {review.product.title ?? "Listing"}
        </Link>
      ) : (
        <p className="text-sm font-extrabold">{review.product.title ?? "Removed listing"}</p>
      )}

      {stat && stat.count > 0 && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <RatingStars value={stat.average} size={12} label={`Average ${stat.average} out of 5`} />
          {stat.average.toFixed(1)} · {reviewCountLabel(stat.count)}
        </span>
      )}
    </div>
  );
}

