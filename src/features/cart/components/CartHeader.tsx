import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { itemCountLabel } from "./schema";
import type { CartTotals } from "../types";

/**
 * Page heading. The count and the figure are the server's numbers, so the header
 * can never disagree with the summary underneath it.
 */
export function CartHeader({ totals, isLoading }: { totals: CartTotals; isLoading?: boolean }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow flex items-center gap-1.5">
          <ShoppingBag size={13} aria-hidden className="text-primary" />
          Almost yours
        </p>
        <h1 className="section-title mt-1 text-3xl">Your cart</h1>
        <p className="mt-1.5 text-sm text-muted-foreground" data-testid="cart-header-count">
          {isLoading ? "Loading your cart…" : itemCountLabel(totals.itemCount)}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {!isLoading && totals.quantityCount > 0 && (
          <p className="font-heading text-lg font-extrabold tabular-nums">
            {formatInr(totals.estimatedTotal)}
          </p>
        )}
        <Button asChild variant="secondary" size="sm">
          <Link to="/browse">
            <ArrowLeft size={14} aria-hidden />
            Continue shopping
          </Link>
        </Button>
      </div>
    </header>
  );
}
