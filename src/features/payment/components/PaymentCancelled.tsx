import { Link } from "@tanstack/react-router";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * A payment the customer walked away from.
 *
 * The copy says the cart is untouched, because it is: cancelling an attempt
 * deliberately never clears the cart. A customer who abandons a payment has
 * still not bought anything, and quietly emptying their cart would be a
 * surprising way to lose their basket.
 */
export function PaymentCancelled({ onResume }: { onResume?: () => void }) {
  return (
    <div className="page-wrap py-16" data-testid="payment-cancelled">
      <EmptyState
        icon={Ban}
        title="Payment cancelled"
        description="You cancelled this payment. Your cart is exactly as you left it — nothing was charged."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            {onResume && (
              <Button onClick={onResume}>
                Resume payment
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link to="/cart">Back to cart</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
