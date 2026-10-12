import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRateTicket } from "../query";

/**
 * Rate a resolution.
 *
 * Shown only once a ticket is resolved or closed, and only until it has been rated.
 * A single submission keeps the metric meaningful; the server rejects a rating outside
 * 1–5 and rejects one on a ticket that is not resolved, so this form is a convenience
 * rather than the rule.
 */
export function TicketRating({ ticketId, rating }: { ticketId: number; rating: number | null }) {
  const [value, setValue] = useState(rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const rate = useRateTicket(ticketId);

  if (rating != null) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="ticket-rating-saved">
        You rated this resolution {rating}/5.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="ticket-rating">
      <p className="text-sm font-medium">How well was this resolved?</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Resolution rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            className="p-0.5"
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setValue(star)}
          >
            <Star
              size={22}
              aria-hidden
              className={
                (hover || value) >= star ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
              }
            />
          </button>
        ))}
      </div>
      <Textarea
        value={comment}
        rows={2}
        maxLength={1000}
        placeholder="Anything to add? (optional)"
        onChange={(event) => setComment(event.target.value)}
      />
      <Button
        size="sm"
        disabled={value === 0 || rate.isPending}
        onClick={() => rate.mutate({ rating: value, comment: comment.trim() || undefined })}
      >
        {rate.isPending ? "Saving…" : "Submit feedback"}
      </Button>
    </div>
  );
}
