import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * A payment the page could not load at all.
 *
 * Distinct from a *payment that failed*: this is the page being unreachable,
 * so the only honest offers are to go back or try again. Showing "your payment
 * failed" here would tell the customer something we do not know.
 */
export function PaymentErrorState({
  title = "We couldn't load your payment",
  description,
}: {
  title?: string;
  description: string;
}) {
  return (
    <div className="page-wrap py-16">
      <EmptyState
        icon={AlertTriangle}
        title={title}
        description={description}
        action={
          <div className="flex justify-center gap-3">
            <Button asChild>
              <Link to="/checkout">Back to checkout</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/cart">View cart</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
