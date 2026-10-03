import { format } from "date-fns";
import { CheckCircle2, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/shared/avatar";
import { RatingStars } from "./RatingStars";
import { ReviewImageGrid } from "./ReviewImages";
import { ReviewActions } from "./ReviewActions";
import { ReviewReply } from "./ReviewReply";
import { authorDisplayName, editedBadge } from "./schema";
import { PURCHASE_TYPE_LABELS } from "../types";
import type { Review } from "../types";

/**
 * One review.
 *
 * The card is the product page's densest trust signal, so it carries the things
 * a shopper actually checks: who wrote it, whether they really bought or rented
 * the thing, what they rated it, what they said, and whether other people found
 * it useful.
 *
 * Two pieces of honesty are load-bearing:
 *
 *  - **The verified badge is only rendered when `isVerifiedPurchase` is true**,
 *    which the server sets solely because it resolved the order line behind the
 *    review. An unverified legacy row shows no badge at all rather than a
 *    generic "reviewed" one.
 *  - **The name is shortened** to a first name and an initial. A public review
 *    does not need to republish a customer's full name, and the profile link is
 *    where the rest lives.
 *
 * `onEdit` is only ever passed by surfaces where the viewer can edit, and even
 * then `ReviewActions` re-checks `viewerOwnsReview` — the prop is a capability,
 * not the permission. `canReply` is the same idea for the seller: the server
 * checks it against the listing's `sellerId`, so rendering the composer is a
 * courtesy rather than the rule.
 */
export function ReviewCard({
  review,
  onEdit,
  showProduct = false,
  compact = false,
  canReply = false,
}: {
  review: Review;
  onEdit?: (review: Review) => void;
  /** "My reviews" and the seller's view show which product this is about. */
  showProduct?: boolean;
  compact?: boolean;
  /** The viewer sells this listing, so the reply composer is rendered. */
  canReply?: boolean;
}) {
  const edited = editedBadge(review.isEdited, review.updatedAt, review.createdAt);

  return (
    <article
      className="raised-surface rounded-3xl p-5"
      aria-label={`${review.author.name}'s review`}
    >
      <header className="flex items-start gap-3">
        <Avatar name={review.author.name} url={review.author.avatarUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-heading text-sm font-extrabold">
              {authorDisplayName(review.author.name)}
            </p>

            {review.isVerifiedPurchase && (
              <Badge
                className="gap-1 bg-primary/10 text-primary"
                title={`Verified from a completed ${PURCHASE_TYPE_LABELS[review.purchaseType].toLowerCase()}`}
              >
                <CheckCircle2 size={11} aria-hidden />
                {PURCHASE_TYPE_LABELS[review.purchaseType]}
              </Badge>
            )}

            {edited && (
              <span className="text-[11px] font-semibold text-muted-foreground">{edited}</span>
            )}

            {review.status !== "PUBLISHED" && (
              <Badge className="bg-destructive/10 text-destructive">{review.status}</Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <RatingStars
              value={review.rating}
              size={13}
              label={`Rated ${review.rating} out of 5`}
            />
            <time dateTime={review.createdAt}>
              {format(new Date(review.createdAt), "d MMM yyyy")}
            </time>
          </div>
        </div>
      </header>

      {showProduct && review.product.title && (
        <p className="mt-3 flex items-center gap-1.5 truncate text-xs font-bold text-muted-foreground">
          <Store size={12} aria-hidden />
          {review.product.title}
        </p>
      )}

      {review.title && (
        <h3 className="mt-3 font-heading text-[15px] font-extrabold leading-snug">
          {review.title}
        </h3>
      )}

      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
        {review.comment}
      </p>

      <ReviewImageGrid images={review.images} />

      <ReviewReply
        reply={review.sellerReply}
        repliedAt={review.sellerRepliedAt}
        reviewId={review.id}
        canReply={canReply}
      />

      <ReviewActions review={review} onEdit={onEdit} compact={compact} />
    </article>
  );
}

/* `Avatar` is the shared one in `@/components/shared/avatar`, which also covers a
   url that is set but 404s — this copy only handled a url that was absent. */
