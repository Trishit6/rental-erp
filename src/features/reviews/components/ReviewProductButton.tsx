import { useState } from "react";
import { MessageSquarePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewForm } from "./ReviewForm";
import { useReview } from "../query";
import type { ReviewPurchaseType } from "../types";

/**
 * "Review Product" / "Edit Review" on an order line.
 *
 * ## The button is a courtesy; the server is the rule
 *
 * This renders *only* for a line the order detail response marked eligible, or
 * one that already carries a review. That verdict comes from the backend's
 * `checkReviewEligibility` — the same function that guards `POST /reviews` — so a
 * button that is shown is a submission the server will accept, and an order that
 * is still in transit simply has no control rather than a disabled one explaining
 * itself. A receipt is not a workflow screen.
 *
 * The form expands **in place**, under the line. Navigating to the product page
 * instead would lose the order context, and the person reviewing something is
 * looking at the order, not the listing.
 *
 * ## Editing fetches the review only when asked
 *
 * The order response says a line has been reviewed but deliberately does not carry
 * the review's text — an order is a receipt, not a review history. Fetching all of
 * a customer's reviews with the order would make a fifty-order account pay for
 * fifty payloads to render one receipt, so the text arrives on click, from the
 * same endpoint the product page's Edit button uses.
 */
export function ReviewProductButton({
  orderItemId,
  purchaseType,
  eligible,
  existingReviewId,
}: {
  orderItemId: number;
  purchaseType: ReviewPurchaseType;
  /** The server's verdict for this line, from the order detail response. */
  eligible: boolean;
  /** Non-null means this line is already reviewed: offer Edit, not Write. */
  existingReviewId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const existing = useReview(open ? existingReviewId : null);

  // Nothing to offer, nothing to explain: an order still in transit is not the
  // place for a countdown to when a button appears.
  if (!existingReviewId && !eligible) return null;

  if (existingReviewId) {
    return (
      <div className="space-y-2 pt-1">
        <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
          <Pencil size={13} aria-hidden />
          Edit your review
        </Button>

        {open && (
          <>
            {existing.data && (
              <ReviewForm
                orderItemId={orderItemId}
                purchaseType={purchaseType}
                editing={existing.data}
                onDone={() => setOpen(false)}
                onCancel={() => setOpen(false)}
              />
            )}
            {existing.isPending && (
              <p className="text-xs text-muted-foreground">Loading your review…</p>
            )}
            {existing.isError && (
              <p role="alert" className="text-xs font-semibold text-destructive">
                We couldn&rsquo;t load that review. Try again.
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <MessageSquarePlus size={14} aria-hidden />
        Review Product
      </Button>

      {open && (
        <ReviewForm
          orderItemId={orderItemId}
          purchaseType={purchaseType}
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}