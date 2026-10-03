import { Package } from "lucide-react";
import type { OrderItem, SellerSummary } from "../types";
import { OrderItemRow } from "./OrderItemRow";

/**
 * Every line of the order.
 *
 * A divider between rows rather than a box per row keeps a multi-item order from
 * turning into a stack of nested cards. The seller name is resolved from the
 * server's seller list, so the row does not have to fetch anything itself.
 */
export function OrderDetailsItems({
  items,
  sellers,
}: {
  items: OrderItem[];
  sellers: SellerSummary[];
}) {
  const sellerNameById = new Map(sellers.map((seller) => [seller.id, seller.name]));

  return (
    <section className="raised-surface overflow-hidden" aria-labelledby="order-items-heading">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2
          id="order-items-heading"
          className="flex items-center gap-2 font-heading text-lg font-extrabold"
        >
          <Package size={16} aria-hidden="true" />
          Items
        </h2>
        <span className="text-xs text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">This order has no items recorded.</p>
      ) : (
        <ul className="divide-y divide-[var(--divider)] px-5" data-testid="order-detail-items">
          {items.map((item) => (
            <OrderItemRow
              key={item.id}
              item={item}
              sellerName={sellerNameById.get(item.sellerId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
