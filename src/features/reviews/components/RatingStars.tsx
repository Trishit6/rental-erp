import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ratingLabel } from "./schema";

/**
 * Star display, and the interactive rating control.
 *
 * ## Why two components in one file
 *
 * A rating is read and written in the same place — the form shows what you have
 * picked, every card shows what someone else picked — and the two must agree on
 * how a fractional rating is drawn. One file means one implementation of
 * "half a star", so a card and a form can never disagree about what 4.5 looks
 * like.
 *
 * ## Accessibility of the input
 *
 * The control is a real radio group (`role="radiogroup"`, one focusable
 * `radio` per star) rather than a row of buttons. That gives keyboard users
 * arrow-key navigation, a single tab stop, and a proper announcement
 * ("4 stars, 3 of 5") — none of which a set of clickable stars provides. Hover
 * only ever changes the *preview*; the committed value lives in a label
 * associated with the group, so what is submitted is never a hover state.
 */
export function RatingStars({
  value,
  size = 16,
  className,
  /** Screen readers get the number; the stars themselves are decorative. */
  label,
}: {
  value: number;
  size?: number;
  className?: string;
  label?: string;
}) {
  const rounded = Math.round(value * 2) / 2;

  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={label ?? ratingLabel(value)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <StarGlyph key={star} star={star} rounded={rounded} size={size} />
      ))}
    </span>
  );
}

function StarGlyph({ star, rounded, size }: { star: number; rounded: number; size: number }) {
  const filled = rounded >= star;
  const half = !filled && rounded >= star - 0.5;

  return (
    <span className="relative inline-flex" style={{ width: size, height: size }}>
      <Star size={size} aria-hidden className="text-muted-foreground/40" />
      {(filled || half) && (
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: half ? size / 2 : size }}
        >
          <Star size={size} aria-hidden className="fill-primary text-primary" />
        </span>
      )}
    </span>
  );
}

/**
 * The interactive rating input.
 *
 * Keyboard: arrows move and select, Home/End jump to 1 and 5 — the behaviour a
 * native radio group gives for free, which is the point of using radios.
 * Hovering previews without committing, and leaving without a click keeps the
 * previously chosen value.
 */
export function RatingInput({
  value,
  onChange,
  error,
  disabled = false,
  size = 34,
}: {
  /** `0` means nothing chosen yet — distinct from a real 1-star rating. */
  value: number;
  onChange: (rating: number) => void;
  error?: string;
  disabled?: boolean;
  size?: number;
}) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  return (
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        aria-label="Your rating"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "review-rating-error" : undefined}
        className="inline-flex items-center gap-1"
        onMouseLeave={() => setHovered(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const selected = value === star;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
              tabIndex={selected || (value === 0 && star === 1) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHovered(star)}
              onFocus={() => setHovered(star)}
              onBlur={() => setHovered(0)}
              // Arrow keys move the selection, matching native radio behaviour.
              onKeyDown={(event) => {
                if (disabled) return;
                if (event.key === "ArrowRight" || event.key === "ArrowUp") {
                  event.preventDefault();
                  onChange(Math.min(5, (value || 1) + 1));
                }
                if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
                  event.preventDefault();
                  onChange(Math.max(1, (value || 1) - 1));
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  onChange(1);
                }
                if (event.key === "End") {
                  event.preventDefault();
                  onChange(5);
                }
              }}
              className={cn(
                "rounded-full p-1 transition-transform focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                "focus-visible:ring-offset-background",
                !disabled && "hover:scale-110 active:scale-95",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <StarGlyph star={star} rounded={shown} size={size} />
            </button>
          );
        })}
      </div>

      {/* The committed value, spelled out — a rating is never shape alone. */}
      <p className="text-xs font-semibold text-muted-foreground">
        {value > 0 ? ratingLabel(value) : "Select a rating"}
      </p>

      {error && (
        <p id="review-rating-error" role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
