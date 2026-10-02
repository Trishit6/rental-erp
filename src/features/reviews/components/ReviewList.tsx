import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewCard } from "./ReviewCard";
import type { Review } from "../types";

/**
 * The review list, with pagination.
 *
 * Paged rather than infinite-scroll, because the product page is a *document*:
 * someone reading reviews wants a footer, a "back to top" and a stable scroll
 * position, and a list that keeps growing under them makes the product details
 * above it impossible to get back to. It also means page 2 is a shareable URL
 * state once the filters live in the query string.
 *
 * The server returns `total`, so this knows whether a next page exists rather
 * than guessing from the page length — a full page that happens to be the last
 * one does not show a button that leads nowhere.
 */
export function ReviewList({
  reviews,
  page,
  totalPages,
  total,
  onPageChange,
  isFetching,
  onEdit,
  showProduct = false,
  canReply = false,
  renderCard,
  emptyState,
}: {
  reviews: Review[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
  onEdit?: (review: Review) => void;
  showProduct?: boolean;
  /** Render the seller's reply composer inside each card. */
  canReply?: boolean;
  /**
   * Replaces the card entirely. Only the seller's view needs this: it shows which
   * listing each review is about above the card, which is information about the
   * *product* rather than about the review.
   */
  renderCard?: (review: Review) => React.ReactNode;
  /** Rendered instead of the list when there is nothing to show. */
  emptyState?: React.ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (reviews.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className="space-y-4">
      {/* Dimmed rather than replaced while a page loads, so the layout holds and
          the reader's scroll position survives the change. */}
      <motion.div
        key={page}
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: isFetching ? 0.6 : 1 }}
        transition={{ duration: 0.18 }}
        className="space-y-4"
      >
        {reviews.map((review) =>
          renderCard ? (
            <div key={review.id}>{renderCard(review)}</div>
          ) : (
            <ReviewCard
              key={review.id}
              review={review}
              onEdit={onEdit}
              showProduct={showProduct}
              canReply={canReply}
            />
          ),
        )}
      </motion.div>

      {totalPages > 1 && (
        <nav
          aria-label="Reviews pagination"
          className="flex items-center justify-center gap-3 pt-1"
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>

          <span className="text-xs font-bold text-muted-foreground" aria-live="polite">
            Page {page} of {totalPages}
            <span className="sr-only">, {total} reviews total</span>
          </span>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => onPageChange(page + 1)}
          >
            {isFetching ? <Loader2 size={14} aria-hidden className="animate-spin" /> : null}
            Load More
          </Button>
        </nav>
      )}
    </div>
  );
}
