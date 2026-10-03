import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { RatingInput } from "./RatingStars";
import { ReviewImages } from "./ReviewImages";
import { useReviewMutation } from "../query";
import { fetchImageUploadConfig } from "@/lib/storage";
import {
  isReviewFormValid,
  REVIEW_COMMENT_MAX,
  reviewCommentSchema,
  reviewFieldErrors,
  reviewFormSchema,
  REVIEW_TITLE_MAX,
  type ReviewFieldErrors,
} from "./schema";
import { PURCHASE_TYPE_LABELS, type Review, type ReviewPurchaseType } from "../types";

/**
 * The review form — create and edit.
 *
 * ## The only identifier it holds is an order line
 *
 * `orderItemId` comes from the server's eligibility answer and is the whole
 * authorisation story from the browser's side. The form has no field for
 * `userId`, `sellerId`, `isVerifiedPurchase` or `status` — not because they
 * would be stripped, but because they are not in `reviewFormSchema`, so the
 * server's `.strict()` schema would reject the request outright. The "verified"
 * badge on the published card is therefore a fact the client cannot assert.
 *
 * ## Validation runs twice, on purpose
 *
 * Zod runs here for immediate feedback (a counter, an inline message, a disabled
 * submit) and again on the server, independently. A client check is a courtesy;
 * it is never the boundary. That is why `isReviewFormValid` exists as a pure
 * function — the same rules the server enforces, so the button cannot promise
 * something the API will refuse.
 */
export function ReviewForm({
  orderItemId,
  purchaseType,
  editing = null,
  onDone,
  onCancel,
}: {
  /** The order line this review is about. Required when creating. */
  orderItemId: number;
  /** Shown as context ("you're reviewing this rental"). Server-derived. */
  purchaseType: ReviewPurchaseType;
  /** A review being edited, or null when writing a new one. */
  editing?: Review | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const mutation = useReviewMutation();

  const [rating, setRating] = useState(editing?.rating ?? 0);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [comment, setComment] = useState(editing?.comment ?? "");
  const [images, setImages] = useState<string[]>(editing?.images ?? []);
  const [errors, setErrors] = useState<ReviewFieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // The upload limits come from the server's storage config, so the browser and
  // the API cannot disagree about what a valid image is.
  const { data: uploadConfig } = useQuery({
    queryKey: ["storage", "config"],
    queryFn: fetchImageUploadConfig,
    staleTime: 10 * 60_000,
  });

  const values = { orderItemId, rating, title, comment, images };
  const valid = isReviewFormValid(values);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    const parsed = reviewFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(reviewFieldErrors(parsed.error));
      return;
    }
    setErrors({});

    mutation.mutate(
      {
        reviewId: editing?.id,
        input: {
          orderItemId,
          rating: parsed.data.rating,
          title: parsed.data.title ?? "",
          comment: parsed.data.comment,
          images: parsed.data.images,
        },
      },
      { onSuccess: onDone },
    );
  }

  const commentCount = comment.length;
  // Only the *upper* bound turns the counter red. An empty or too-short comment
  // is expected while someone is still typing, so flagging it would be noise;
  // the inline hint below already says what is still needed.
  const commentTooLong = comment.length > REVIEW_COMMENT_MAX;

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="raised-surface space-y-5 rounded-3xl p-5"
      aria-label={editing ? "Edit your review" : "Write a review"}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-extrabold">
            {editing ? "Edit Review" : "Write a Review"}
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-primary">
            {PURCHASE_TYPE_LABELS[purchaseType]}
          </p>
        </div>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel"
            onClick={onCancel}
            disabled={mutation.isPending}
          >
            <X size={16} aria-hidden />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-sm font-bold">Your rating</span>
        <RatingInput
          value={rating}
          onChange={setRating}
          disabled={mutation.isPending}
          error={submitted ? errors.rating : undefined}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="review-title" className="text-sm font-bold">
          Title <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="review-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={REVIEW_TITLE_MAX}
          disabled={mutation.isPending}
          placeholder="Sum it up in a few words"
          aria-invalid={submitted && !!errors.title}
        />
        {submitted && errors.title && (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {errors.title}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="review-comment" className="text-sm font-bold">
            Your experience
          </label>
          <span
            className={`text-[11px] tabular-nums ${commentTooLong ? "text-destructive" : "text-muted-foreground"}`}
          >
            {commentCount}/{REVIEW_COMMENT_MAX}
          </span>
        </div>
        <Textarea
          id="review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={5}
          maxLength={REVIEW_COMMENT_MAX + 200}
          disabled={mutation.isPending}
          placeholder="What was the item like? How was the handover?"
          aria-invalid={submitted && !!errors.comment}
          aria-describedby="review-comment-hint"
        />
        <p id="review-comment-hint" className="text-xs text-muted-foreground">
          {reviewCommentSchema.safeParse(comment).success
            ? "At least 10 characters — that's what makes a review useful to the next person."
            : "Tell other people a little more — at least 10 characters."}
        </p>
        {submitted && errors.comment && (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {errors.comment}
          </p>
        )}
      </div>

      <ReviewImages
        images={images}
        onChange={setImages}
        config={uploadConfig ?? null}
        disabled={mutation.isPending}
      />
      {submitted && errors.images && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {errors.images}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          // Disabled while invalid *and* while saving, so the form can never be
          // double-submitted into the duplicate-review 409.
          disabled={!valid || mutation.isPending}
          aria-busy={mutation.isPending}
        >
          {mutation.isPending && <Loader2 size={14} aria-hidden className="animate-spin" />}
          {mutation.isPending ? "Saving…" : editing ? "Save changes" : "Publish review"}
        </Button>
      </div>
    </motion.form>
  );
}
