import { Link } from "@tanstack/react-router";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * A payment that did not go through.
 *
 * The copy leads with "you have not been charged" because that is the question
 * every customer has at this point, and Retry re-opens the *same* payment
 * attempt rather than starting a new order — the server's idempotency key
 * guarantees a retry can never produce a second order or a second charge.
 */
export function PaymentFailed({
  reason,
  onRetry,
  isRetrying,
}: {
  reason?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div className="page-wrap py-16" data-testid="payment-failed">
      <EmptyState
        icon={XCircle}
        title="Payment failed"
        description={`Your payment could not be completed. You have not been charged.${
          reason ? ` (${reason})` : ""
        }`}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            {onRetry && (
              <Button onClick={onRetry} disabled={isRetrying}>
                {isRetrying ? "Retrying..." : "Try again"}
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link to="/checkout">Back to checkout</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
