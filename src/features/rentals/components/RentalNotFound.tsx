import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * The rental does not exist, or is not this customer's.
 *
 * One screen for both, on purpose: distinguishing them would tell anyone probing
 * rental ids which ones are real. The server returns the same 404 for "missing"
 * and "someone else's" for exactly that reason, and the UI must not undo it.
 */
export function RentalNotFound({ reference }: { reference?: string | number }) {
  return (
    <div className="page-wrap py-16" data-testid="rental-not-found">
      <EmptyState
        icon={FileQuestion}
        title="Rental not found"
        description={
          reference
            ? `We couldn't find a rental matching "${reference}". It may have been removed, or the link may be incorrect.`
            : "We couldn't find that rental. It may have been removed, or the link may be incorrect."
        }
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/rentals">Back to My Rentals</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/browse" search={{ mode: "rent" }}>
                Browse rentals
              </Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
