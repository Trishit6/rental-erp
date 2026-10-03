import { Link } from "@tanstack/react-router";
import { ProductImage } from "@/components/shared/product-image";
import { cn } from "@/lib/utils/cn";

/**
 * A cart line's thumbnail.
 *
 * Links to the product through TanStack Router (never `window.location`), and
 * falls back to a neutral tile when a listing has no image or the image fails —
 * a cart should never render a broken image icon mid-purchase.
 *
 * This used to swap the fallback in by reaching through the DOM
 * (`nextElementSibling.classList.remove("hidden")`) from the `onError` handler,
 * which only worked because the fallback happened to be the next sibling. It now
 * uses the same `ProductImage` as every other surface, so a failure is state
 * rather than a DOM coincidence.
 *
 * A deleted product still renders: the line is kept so it can be removed, so the
 * link is simply omitted rather than pointing at nothing.
 */
export function CartItemImage({
  src,
  alt,
  slug,
  className,
}: {
  src: string | null;
  alt: string;
  /** Absent when the product no longer exists. */
  slug?: string;
  className?: string;
}) {
  const image = (
    <div
      className={cn(
        "inset-surface shrink-0 overflow-hidden rounded-2xl p-1.5",
        className ?? "size-20 sm:size-24",
      )}
    >
      <ProductImage src={src} alt={alt} className="rounded-xl" />
    </div>
  );

  if (!slug) return image;

  return (
    <Link
      to="/product/$slug"
      params={{ slug }}
      className="shrink-0 rounded-2xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      aria-label={`View ${alt}`}
    >
      {image}
    </Link>
  );
}
