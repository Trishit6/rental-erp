import { Link } from "@tanstack/react-router";
import { CalendarRange, ExternalLink, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OrderDetail, OrderItem, OrderRental } from "../types";

/**
 * The actions available on an order, chosen by what the order actually is.
 *
 * Every action here navigates to a page that exists. There is deliberately no
 * "Track shipment" (no carrier integration), no "Return item" or "Cancel rental"
 * (rental lifecycle is a separate feature), no "Contact seller" (messaging is its
 * own feature) and no "Buy again" (no re-order endpoint). Each of those would be
 * a button that leads nowhere, which is worse than not offering it — the spec is
 * explicit that unfinished functionality must not be dressed up as working.
 */
export function OrderActions({
  order,
  items,
  rentals,
}: {
  order: OrderDetail;
  items: OrderItem[];
  rentals: OrderRental[];
}) {
  // The first line that still has a live product page to link to.
  const linkableItem = items.find((item) => Boolean(item.productSlug));
  const isCancelled = order.status === "CANCELLED";

  return (
    <section className="raised-surface p-5" aria-labelledby="order-actions-heading">
      <h2 id="order-actions-heading" className="font-heading text-lg font-extrabold">
        Actions
      </h2>

      <div className="mt-3 flex flex-col gap-2.5">
        {linkableItem?.productSlug && (
          <Button asChild>
            <Link to="/product/$slug" params={{ slug: linkableItem.productSlug }}>
              <ExternalLink size={14} aria-hidden="true" />
              {items.length > 1 ? "View first product" : "View product"}
            </Link>
          </Button>
        )}

        {rentals.length > 0 && (
          <Button asChild variant="secondary">
            <Link to="/rentals">
              <CalendarRange size={14} aria-hidden="true" />
              View my rentals
            </Link>
          </Button>
        )}

        <Button asChild variant="secondary">
          <Link to="/browse">
            <ShoppingBag size={14} aria-hidden="true" />
            {isCancelled ? "Browse similar items" : "Continue shopping"}
          </Link>
        </Button>
      </div>

      {!linkableItem && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          The products in this order are no longer listed, so there is nothing to link to.
          Your order record is unaffected.
        </p>
      )}
    </section>
  );
}
