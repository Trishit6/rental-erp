import { Link } from "@tanstack/react-router";
import { SearchX, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Two genuinely different situations, deliberately not merged:
 *
 *  - `none`     — the customer has never ordered anything. The useful action is
 *                 to go shopping.
 *  - `filtered` — they have orders, just none matching *this* search. The useful
 *                 action is to clear the filters, and telling them they have "no
 *                 orders" here would be plainly false.
 *
 * Collapsing these into one message is the classic empty-state bug: a customer
 * with forty orders is told they have none because a filter is still applied.
 */
export function OrdersEmptyState({
  variant,
  onClearFilters,
}: {
  variant: "none" | "filtered";
  onClearFilters?: () => void;
}) {
  if (variant === "filtered") {
    return (
      <EmptyState
        icon={SearchX}
        title="No orders found"
        description="Try changing your search or filters."
        action={onClearFilters && <Button onClick={onClearFilters}>Clear filters</Button>}
      />
    );
  }

  return (
    <EmptyState
      icon={ShoppingBag}
      title="No orders yet"
      description="Your Revaro journey starts here."
      action={
        <Button asChild>
          <Link to="/browse">Start browsing</Link>
        </Button>
      }
    />
  );
}
