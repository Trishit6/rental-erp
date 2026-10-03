import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A user's picture, with a name-derived fallback.
 *
 * This replaces four hand-rolled copies (the review card, the seller card, the
 * order's seller info and the rental's seller info). Every one of them handled a
 * *missing* url and none handled a *broken* one, so a `avatar_url` pointing at a
 * deleted upload rendered the browser's broken-image icon inside a circle.
 *
 * The initial comes from the *display* name so it matches the text beside it, and
 * the whole control is decorative — the name is already on screen as text, so the
 * avatar needs no accessible name of its own.
 */
export function Avatar({
  name,
  url,
  className,
  fallback,
}: {
  name: string;
  url: string | null | undefined;
  /** The fixed box. Supply a `size-*` or the circle has nothing to size against. */
  className?: string;
  /**
   * Replaces the initial when there is no picture. Surfaces that identify a seller
   * with a shop glyph rather than a person's initial pass one here.
   */
  fallback?: ReactNode;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "R";
  const [failed, setFailed] = useState(false);

  const usable = typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
  const showInitial = !usable || failed;

  // Resetting during render rather than in an effect: a recycled row that now
  // shows a different person must not keep the previous one's failure.
  const [seenUrl, setSeenUrl] = useState(usable);
  if (seenUrl !== usable) {
    setSeenUrl(usable);
    setFailed(false);
  }

  const hide = useCallback(() => setFailed(true), []);

  if (showInitial) {
    return (
      <span
        aria-hidden
        className={cn(
          "inset-surface flex shrink-0 items-center justify-center rounded-full font-heading font-black text-primary",
          className ?? "size-10 text-sm",
        )}
      >
        {fallback ?? initial}
      </span>
    );
  }

  return (
    <img
      src={usable}
      alt=""
      loading="lazy"
      decoding="async"
      onError={hide}
      className={cn(
        "shrink-0 rounded-full object-cover ring-1 ring-border/60",
        className ?? "size-10",
      )}
    />
  );
}
