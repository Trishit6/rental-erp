import { useState } from "react";
import { Pencil, ShieldCheck, ThumbsUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteReview, useMarkHelpful } from "../query";
import { canManageReview, canMarkHelpful } from "./schema";
import type { Review } from "../types";

/**
 * What a reader can do with a review, and what its author can do with their own.
 *
 * Every button here is gated on a value the **server** sent
 * (`viewerOwnsReview`, `viewerMarkedHelpful`) rather than on something the
 * browser worked out. That is not defensive programming — a client that guessed
 * an author id would find the button rendered and then get a 404, so the UI
 * being right matters as much as the API refusing.
 *
 * "Helpful" is the only optimistic control in the feature, and it is optimistic
 * because the action is reversible: the counter is corrected by the response
 * whether or not the guess was right.
 */
export function ReviewActions({
  review,
  onEdit,
  compact = false,
}: {
  review: Review;
  onEdit?: (review: Review) => void;
  compact?: boolean;
}) {
  const markHelpful = useMarkHelpful();
  const remove = useDeleteReview();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isOwner = canManageReview(review);
  const canHelp = canMarkHelpful(review);
  const size = compact ? "sm" : "default";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {canHelp && (
        <Button
          type="button"
          variant="secondary"
          size={size}
          aria-pressed={review.viewerMarkedHelpful}
          // Disabled while the vote is in flight so a double-tap cannot send two
          // toggles — which would be a no-op at best and a 409 at worst.
          disabled={markHelpful.isPending}
          onClick={() => markHelpful.mutate(review)}
          className={review.viewerMarkedHelpful ? "text-primary" : undefined}
        >
          <ThumbsUp size={14} aria-hidden />
          Helpful {review.helpfulCount}
        </Button>
      )}

      {isOwner && onEdit && (
        <Button type="button" variant="secondary" size={size} onClick={() => onEdit(review)}>
          <Pencil size={14} aria-hidden />
          Edit
        </Button>
      )}

      {isOwner && (
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => setConfirmOpen(true)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} aria-hidden />
          Delete
        </Button>
      )}

      <DeleteReviewDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        isPending={remove.isPending}
        onConfirm={() => {
          remove.mutate(review, { onSettled: () => setConfirmOpen(false) });
        }}
      />
    </div>
  );
}

/**
 * Delete confirmation.
 *
 * Deliberately says what deletion *means* here, which is not obvious: the review
 * disappears, the product's rating is recomputed without it, and the order line
 * becomes reviewable again — so this is a genuine reversal rather than a spent
 * opportunity. A generic "are you sure?" would leave someone hesitating over a
 * decision that is in fact safe to change their mind about.
 *
 * The `variant` changes the *consequence*, not just the wording: the moderator's
 * copy removes somebody else's words and points at hiding as the reversible
 * alternative, because for a moderator the two are genuinely different acts. One
 * dialog with two variants rather than two dialogs, so the destructive button's
 * behaviour cannot drift between them.
 */
export function DeleteReviewDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
  variant = "author",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
  variant?: "author" | "moderator";
}) {
  const moderator = variant === "moderator";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {moderator ? (
              <>
                <ShieldCheck size={16} aria-hidden className="mr-1.5 inline" />
                Delete this review?
              </>
            ) : (
              "Delete review?"
            )}
          </DialogTitle>
          <DialogDescription>
            {moderator
              ? "This removes the customer's words permanently, not just from the page."
              : "This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
          {moderator ? (
            <>
              The product&rsquo;s rating is recalculated without it and the order line becomes
              reviewable again. Prefer <strong>Hide</strong> if you only need it off the page.
            </>
          ) : (
            <>
              Your review will be removed and the product&rsquo;s rating recalculated without it.
              You can review the item again later — the order will still qualify.
            </>
          )}
        </p>

        <DialogFooter className="pt-4">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isPending}
            aria-busy={isPending}
            onClick={onConfirm}
            className="text-destructive"
          >
            <Trash2 size={14} aria-hidden />
            {isPending ? "Deleting…" : moderator ? "Delete review" : "Delete Review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
