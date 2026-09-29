import { RefreshCw, WifiOff } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Failure state for the wishlist.
 *
 * "Try again" refetches the wishlist query only — it never reloads the page and
 * never discards the filters and search the user has already typed, so a
 * transient failure does not cost them their place.
 */
export function FavoritesErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={WifiOff}
      title="We couldn't load your favorites"
      description="Check your connection and try again — your filters and search are still here."
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden />
          Try again
        </Button>
      }
    />
  );
}
