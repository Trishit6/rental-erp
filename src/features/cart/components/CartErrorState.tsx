import { RefreshCw, WifiOff } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * The cart failed to load. Retrying refetches the cart query only — it never
 * reloads the page and never discards anything the user was doing.
 */
export function CartErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={WifiOff}
      title="We couldn't load your cart"
      description="Check your connection and try again. Anything you've added is safe — it's saved to your account."
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden />
          Try again
        </Button>
      }
    />
  );
}
