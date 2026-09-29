import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Retry refetches the current query — it never resets the user's filters, so a
 * transient failure doesn't lose the work of narrowing down a search.
 */
export function BrowseErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={WifiOff}
      title="Something went wrong"
      description="We couldn't load these listings. Check your connection and try again — your filters are still here."
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
