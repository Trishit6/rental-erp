import { ProductGridSkeleton } from "@/components/ui/skeleton";

/**
 * Wishlist loading state.
 *
 * It reuses the shared product-card skeleton, so a wishlist load looks exactly
 * like any other grid loading — no second, near-identical skeleton design.
 *
 * This only renders on a *first* load. A background refetch keeps the current
 * cards on screen (dimmed) instead of replacing the page, so the user never
 * loses their place.
 */
export function FavoritesSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading your favorites">
      <ProductGridSkeleton count={count} />
    </div>
  );
}
