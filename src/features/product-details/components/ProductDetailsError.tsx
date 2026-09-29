import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/** A failed load keeps the visitor where they are — retry refetches, never reloads the page. */
export function ProductDetailsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="page-wrap py-16">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        description="Unable to load this product. Check your connection and try again."
        action={
          <Button onClick={onRetry}>
            <RotateCcw size={15} aria-hidden />
            Try again
          </Button>
        }
      />
    </div>
  );
}
