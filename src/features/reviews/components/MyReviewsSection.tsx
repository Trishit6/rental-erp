import { useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewList } from "./ReviewList";
import { ReviewForm } from "./ReviewForm";
import {
  MyReviewsEmptyState,
  ReviewsErrorState,
  ReviewsSkeleton,
} from "./ReviewStates";
import { useMyReviews } from "../query";
import type { Review, ReviewStatus } from "../types";

/**
 * "My Reviews" — the customer's own review history, on the profile page.
 *
 * Every row is shown with its product, because a review is meaningless without
 * knowing what it is about, and the customer cannot review an item they have not
 * bought — so there is nothing to write *here*, only to edit. Writing happens
 * where the transaction is: on the order page, against the order line.
 *
 * The status filter exists because a review can be hidden by a moderator, and a
 * customer who has written something and cannot see it deserves to know it is
 * still there. Hidden reviews are only visible *to their author* — the product
 * page filter cannot widen that.
 */
export function MyReviewsSection() {
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Review | null>(null);

  const query = useMyReviews({ status, page, pageSize: 5 });

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;

  return (
    <section aria-labelledby="my-reviews-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-reviews-heading" className="flex items-center gap-2 font-heading text-lg font-extrabold">
          <MessageSquareQuote size={17} aria-hidden className="text-primary" />
          My Reviews
        </h2>

        <div className="flex gap-2" role="group" aria-label="Filter your reviews">
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
        <>
          {editing && editing.orderItemId && (
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
            page={pagination?.page ?? page}
            totalPages={pagination?.totalPages ?? 1}
            total={pagination?.total ?? items.length}
            onPageChange={setPage}
            isFetching={query.isFetching}
            showProduct
            onEdit={setEditing}
            emptyState={<MyReviewsEmptyState />}
          />
        </>
      )}
    </section>
  );
}