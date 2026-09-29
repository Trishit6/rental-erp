import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * The order does not exist, or is not this customer's.
 *
 * Deliberately one screen for both cases: distinguishing them would tell anyone
 * probing order numbers which ones are real. The server returns the same 404 for
 * "missing" and "someone else's" for exactly this reason, and the UI must not
 * undo that by guessing.
 */
export function OrderNotFound({ reference }: { reference?: string }) {
  return (
    <div className="page-wrap py-16" data-testid="order-not-found">
      <EmptyState
        icon={FileQuestion}
        title="Order not found"
        description={
          reference
            ? `We couldn't find an order matching "${reference}". It may have been removed, or the link may be incorrect.`
            : "We couldn't find that order. It may have been removed, or the link may be incorrect."
        }
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/orders">Back to orders</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/browse">Browse items</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
