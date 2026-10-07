import { Link } from "@tanstack/react-router";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useCartQuery } from "@/lib/query/cart";
import { formatInr } from "@/lib/pricing";

/**
 * The real cart, read from the same shared cache entry the drawer and the cart
 * page use. The subtotal is the server's figure — the client never re-derives
 * an authoritative price.
 */
export function CartSummary() {
  const { cart, items, isPending, isError, refetch } = useCartQuery();
  const hasItems = items.length > 0;

  return (
    <Card className="flex flex-col p-5">
      <h2 className="flex items-center gap-2 font-heading text-base font-extrabold">
        <ShoppingCart size={16} aria-hidden className="text-primary" />
        Your Cart
      </h2>

      {isPending ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : isError ? (
        <div className="mt-4 rounded-2xl bg-destructive/8 px-4 py-3 text-sm font-semibold text-destructive">
          Cart failed to load
          <Button type="button" variant="ghost" size="sm" className="ml-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : !hasItems ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Start exploring Revaro and add something you love."
          action={
            <Link
              to="/browse"
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-foreground hover:text-primary"
            >
              Start browsing
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
        />
      ) : (
        <div className="mt-4 space-y-4">
          <ul className="space-y-3">
            {items.slice(0, 3).map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <span className="soft-button flex size-9 shrink-0 items-center justify-center rounded-xl text-primary">
                  <ShoppingCart size={15} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{item.product?.title ?? "Item"}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.listingType === "RENT" ? `${item.rentalDuration} days · ` : ""}
                    {formatInr(item.pricing.lineTotal)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl bg-foreground/[0.035] px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {cart.totals.itemCount} item{cart.totals.itemCount === 1 ? "" : "s"}
              </span>
              <span className="font-heading text-lg font-black tabular-nums">
                {formatInr(cart.totals.subtotal)}
              </span>
            </div>
          </div>

          <Link
            to="/cart"
            className="soft-button inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-foreground hover:text-primary"
          >
            View cart
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      )}
    </Card>
  );
}