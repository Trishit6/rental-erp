import { useState } from "react";
import { format } from "date-fns";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReplyToReview } from "../query";

/**
 * The seller's public reply.
 *
 * Read side and write side in one component because they are two states of one
 * thing: a review either has a reply or the seller can add one. A separate
 * "seller response" component with its own store would be a second source for
 * the same field.
 *
 * The write side is only rendered when the caller says the viewer owns the
 * listing — the server enforces that independently against the product's
 * `sellerId`, so a crafted request is refused with a 403 even if this renders.
 */
export function ReviewReply({
  reply,
  repliedAt,
  reviewId,
  canReply = false,
}: {
  /** The stored reply, or null. */
  reply: string | null;
  repliedAt: string | null;
  /** Only needed when `canReply` — the reply's own id. */
  reviewId?: number;
  /** True when the viewer is the seller of the reviewed product. */
  canReply?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (canReply && reviewId) {
    return (
      <SellerReplyEditor
        reviewId={reviewId}
        reply={reply}
        repliedAt={repliedAt}
        editing={editing}
        onEditingChange={setEditing}
      />
    );
  }

  if (!reply) return null;

  return (
    <div className="mt-4 rounded-2xl bg-black/[0.03] p-3.5 dark:bg-white/[0.04]">
      <div className="flex items-center gap-1.5">
        <Store size={13} aria-hidden className="text-primary" />
        <p className="text-xs font-extrabold">Seller Response</p>
        {repliedAt && (
          <time dateTime={repliedAt} className="ml-auto text-[11px] text-muted-foreground">
            {format(new Date(repliedAt), "d MMM yyyy")}
          </time>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
        {reply}
      </p>
    </div>
  );
}

/**
 * Reply composer.
 *
 * Editing an existing reply replaces it rather than appending — a review has one
 * seller response, not a thread, and a second endpoint for "amend my reply"
 * would only ever do the same write. The customer's own words are not editable
 * from here at all; the endpoint this calls takes a body and nothing else.
 */
function SellerReplyEditor({
  reviewId,
  reply,
  repliedAt,
  editing,
  onEditingChange,
}: {
  reviewId: number;
  reply: string | null;
  repliedAt: string | null;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const mutation = useReplyToReview();
  const [body, setBody] = useState(reply ?? "");

  const trimmed = body.trim();
  const canSubmit = trimmed.length >= 2 && trimmed.length <= 1000 && !mutation.isPending;

  if (!editing) {
    return (
      <div className="mt-4 space-y-2">
        {reply ? (
          <div className="rounded-2xl bg-black/[0.03] p-3.5 dark:bg-white/[0.04]">
            <div className="flex items-center gap-1.5">
              <Store size={13} aria-hidden className="text-primary" />
              <p className="text-xs font-extrabold">Seller Response</p>
              {repliedAt && (
                <time dateTime={repliedAt} className="ml-auto text-[11px] text-muted-foreground">
                  {format(new Date(repliedAt), "d MMM yyyy")}
                </time>
              )}
            </div>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
              {reply}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            This customer has reviewed your listing and you haven&rsquo;t replied yet.
          </p>
        )}

        <Button type="button" variant="secondary" size="sm" onClick={() => onEditingChange(true)}>
          {reply ? "Edit reply" : "Reply to Review"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2 rounded-2xl bg-black/[0.03] p-3.5 dark:bg-white/[0.04]">
      <label htmlFor={`seller-reply-${reviewId}`} className="text-xs font-extrabold">
        Seller Response
      </label>
      <Textarea
        id={`seller-reply-${reviewId}`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={1000}
        rows={3}
        disabled={mutation.isPending}
        placeholder="Thanks for the feedback — here's what we changed."
        className="min-h-20"
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            setBody(reply ?? "");
            onEditingChange(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          aria-busy={mutation.isPending}
          onClick={() =>
            mutation.mutate(
              { reviewId, body: trimmed },
              {
                onSuccess: () => onEditingChange(false),
              },
            )
          }
        >
          {mutation.isPending ? "Publishing…" : "Publish reply"}
        </Button>
      </div>
    </div>
  );
}
