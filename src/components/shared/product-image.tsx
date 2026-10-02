import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The one image renderer for seller-supplied media.
 *
 * Every product photo in the app arrives as an arbitrary URL from the database,
 * and any of them can be null, empty, malformed, or 404. A bare `<img>` turns
 * each of those into a browser broken-image icon with the alt text painted
 * underneath it, which is what the product cards were showing. This component
 * makes that state unrepresentable:
 *
 *   - no usable `src`  → the placeholder immediately, with no network request
 *   - `src` given      → a shimmering skeleton while it loads, then a fade-in
 *   - load fails       → a static placeholder, and the failure is logged once
 *
 * Two invariants matter more than they look:
 *
 *  1. **No layout shift.** The caller owns the box (an `aspect-*` class); the
 *     image and the placeholder are both absolutely positioned inside it. The
 *     height is decided before the bytes arrive and does not change when they
 *     do — so a slow or failed image cannot make the grid jump as you scroll.
 *  2. **Alt text is never rendered.** It stays on the `<img>` for assistive
 *     technology only; the placeholder is its own visual surface.
 */

/**
 * Failures already reported. A broken URL is usually one bad row rendered into
 * twenty grid cells, and the same console message twenty times is noise that
 * hides the one line an agent actually needs.
 */
const reportedFailures = new Set<string>();

function reportFailure(src: string, label: string) {
  if (reportedFailures.has(src)) return;
  reportedFailures.add(src);
  if (import.meta.env.DEV) {
    console.warn(`[image] failed to load image for "${label}": ${src}`);
  }
}

/**
 * The fallback surface.
 *
 * `loading` picks the shimmer; without it the placeholder is static, because a
 * sweeping gradient over an image that is already known to be gone would be
 * advertising a request that is never coming.
 */
export function ImagePlaceholder({
  label = "Image unavailable",
  loading = false,
  className,
}: {
  label?: string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-1.5 bg-[var(--inset-bg)] text-muted-foreground",
        loading && "image-skeleton",
        className,
      )}
      // Decorative: the `<img>` carries the accessible name, and the fallback
      // would otherwise be announced a second time.
      aria-hidden
    >
      <ImageOff size={22} />
      <span className="px-3 text-center text-[11px] font-semibold leading-tight">{label}</span>
    </div>
  );
}

export function ProductImage({
  src,
  alt,
  className,
  imgClassName,
  label = "Image unavailable",
  fallback,
  /** Above-the-fold images skip the lazy hint; the rest stay lazy. */
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  /** The fixed box. Give it an `aspect-*` class — that is what prevents shift. */
  className?: string;
  imgClassName?: string;
  /**
   * A short *status* string for the placeholder — e.g. "Photo unavailable".
   * Never the alt text: the placeholder is a visual surface, and putting the alt
   * text in it paints a description onto the page (and, on a product card,
   * prints the title twice).
   */
  label?: string;
  /**
   * Replaces the default placeholder when the image is missing or fails. Used
   * where the domain already has a better answer than "unavailable" — a category
   * tile falls back to its own glyph. The node is stretched to fill the box.
   */
  fallback?: ReactNode;
  priority?: boolean;
}) {
  // Treat a blank/whitespace string as "no image", not as a request for "".
  const usable = typeof src === "string" && src.trim().length > 0 ? src.trim() : null;

  const [phase, setPhase] = useState<{
    src: string | null;
    loaded: boolean;
    failed: boolean;
  }>(() => ({ src: usable, loaded: false, failed: false }));

  // A new URL is a new image, so it starts over. Adjusting during render rather
  // than in an effect means the swap costs one render instead of an extra
  // commit — and it is how a recycled card avoids showing the *previous*
  // photo's "loaded" state (or its failure) against the new one.
  if (phase.src !== usable) {
    setPhase({ src: usable, loaded: false, failed: false });
  }

  // `false` until the src matches, which is the case on the render where we
  // just reset; the re-render React schedules immediately picks up the new phase.
  const settled = phase.src === usable;
  const loaded = settled && phase.loaded;
  const failed = settled && phase.failed;

  // `src` can already be complete by the time the ref runs (a cached image
  // decoded before hydration), and `load` never fires for that case.
  const attachImage = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) {
      setPhase((current) => (current.loaded ? current : { ...current, loaded: true }));
    }
  }, []);

  if (!usable || failed) {
    return (
      <div className={cn("relative size-full overflow-hidden", className)}>
        {fallback ?? <ImagePlaceholder label={label} />}
      </div>
    );
  }

  return (
    <div className={cn("relative size-full overflow-hidden", className)}>
      {!loaded && <ImagePlaceholder label={label} loading className="absolute inset-0" />}
      <img
        ref={attachImage}
        src={usable}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onLoad={() =>
          setPhase((current) => (current.loaded ? current : { ...current, loaded: true }))
        }
        onError={() => {
          setPhase((current) => (current.failed ? current : { ...current, failed: true }));
          reportFailure(usable, alt);
        }}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-300 motion-reduce:transition-none",
          loaded ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
    </div>
  );
}