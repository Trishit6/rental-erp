import { useState } from "react";
import { EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReviewCard } from "./ReviewCard";
import { ReviewList } from "./ReviewList";
import { DeleteReviewDialog } from "./ReviewActions";
import { ReviewsErrorState, ReviewsSkeleton } from "./ReviewStates";
import { useModerationQueue, useReviewModeration } from "../query";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  type Review,
  type ReviewStatus,
} from "../types";

/**
 * The admin review queue.
 *
 * ## Hiding first, deleting second
 *
 * The queue's default action is *hide*, not delete, and the two are separate
 * buttons with a confirmation on the destructive one. That ordering is the whole
 * moderation policy: hiding is reversible and changes nothing about the review,
 * so a moderator who is unsure should reach for it. Deletion is for content that
 * should not exist, and it also frees the order line so the customer can review
 * again — a heavier consequence than "this is not shown".
 *
 * ## Every status, by default
 *
 * The queue shows hidden reviews too. A moderator's job includes deciding
 * whether to restore one, which is impossible if the queue filters them out.
 */
export function ModerationSection() {
  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Review | null>(null);

  const query = useModerationQueue({ status, page, pageSize: 10 });
  const moderation = useReviewModeration();

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-extrabold">Review moderation</h2>
          <p className="text-sm text-muted-foreground">
            Hide a review to take it off the product page, or restore one. The product&rsquo;s
            rating is recalculated either way.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          <Button
            size="sm"
            variant={status === null ? "default" : "secondary"}
            aria-pressed={status === null}
            onClick={() => {
              setStatus(null);
              setPage(1);
            }}
          >
            All
          </Button>
          {REVIEW_STATUSES.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? "default" : "secondary"}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {REVIEW_STATUS_LABELS[value]}
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
          showProduct
          emptyState={
            <p className="inset-surface rounded-3xl px-5 py-8 text-center text-sm text-muted-foreground">
              No reviews match this filter.
            </p>
          }
          renderCard={(review) => (
            <div className="space-y-2">
              <ReviewCard review={review} showProduct />
              <ModerationActions
                review={review}
                busy={moderation.setStatus.isPending || moderation.remove.isPending}
                onSetStatus={(next) => moderation.setStatus.mutate({ reviewId: review.id, status: next })}
                onDelete={() => setPendingDelete(review)}
              />
            </div>
          )}
        />
      )}

      <DeleteReviewDialog
        variant="moderator"
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        isPending={moderation.remove.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          const target = pendingDelete;
          moderation.remove.mutate(target, { onSettled: () => setPendingDelete(null) });
        }}
      />
    </div>
  );
}

/**
 * One review's moderation controls.
 *
 * The action offered is the *inverse* of the current state, so the button always
 * says what it will do: a published review offers "Hide", a hidden one offers
 * "Restore". Offering both at once would leave the moderator guessing which one
 * is safe to press.
 */
function ModerationActions({
  review,
  busy,
  onSetStatus,
  onDelete,
}: {
  review: Review;
  busy: boolean;
  onSetStatus: (status: ReviewStatus) => void;
  onDelete: () => void;
}) {
  const hidden = review.status !== "PUBLISHED";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className={hidden ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}>
        {REVIEW_STATUS_LABELS[review.status]}
      </Badge>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onSetStatus(hidden ? "PUBLISHED" : "HIDDEN")}
      >
        {hidden ? (
          <>
            <RotateCcw size={13} aria-hidden />
            Restore
          </>
        ) : (
          <>
            <EyeOff size={13} aria-hidden />
            Hide
          </>
        )}
      </Button>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={13} aria-hidden />
        Delete
      </Button>
    </div>
  );
}

/**
 * Moderator's delete confirmation — the shared dialog, told which consequence it
 * is describing. One implementation so the destructive button's pending state and
 * wiring cannot differ between the author's copy and the moderator's.
 */