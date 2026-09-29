import { MapPin, Phone, Store, Truck } from "lucide-react";
import type { DeliveryAddress, DeliveryMethod, OrderStatus } from "../types";
import { OrderStatusBadge } from "./OrderStatusBadge";

/**
 * Where the order is going.
 *
 * Reads the order's address *snapshot*, never the customer's current profile
 * address. Editing your address next year must not rewrite where last year's
 * order was sent — a historical order has to keep showing what was true when it
 * was placed, which is exactly why Feature 10 stored a copy.
 */
export function OrderDeliverySummary({
  method,
  address,
  status,
  trackingNumber,
}: {
  method: DeliveryMethod;
  address: DeliveryAddress | null;
  status: OrderStatus;
  trackingNumber: string | null;
}) {
  const isPickup = method === "PICKUP";

  return (
    <section className="raised-surface p-5" aria-labelledby="order-delivery-heading">
      <h2
        id="order-delivery-heading"
        className="flex items-center gap-2 font-heading text-lg font-extrabold"
      >
        {isPickup ? <Store size={16} aria-hidden="true" /> : <Truck size={16} aria-hidden="true" />}
        {isPickup ? "Pickup" : "Delivery"}
      </h2>

      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Status</span>
        <OrderStatusBadge status={status} size="sm" />
      </div>

      {isPickup ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Collect from the seller. They will be in touch to arrange a time.
        </p>
      ) : address ? (
        <address
          className="mt-3 space-y-1 text-sm not-italic text-muted-foreground"
          data-testid="order-delivery-address"
        >
          {address.name && <p className="font-semibold text-foreground">{address.name}</p>}
          <p className="flex items-start gap-2">
            <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {[address.addressLine1, address.addressLine2].filter(Boolean).join(", ")}
              <br />
              {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}
              {address.country ? `, ${address.country}` : null}
            </span>
          </p>
          {address.phone && (
            <p className="flex items-center gap-2">
              <Phone size={12} aria-hidden="true" />
              {address.phone}
            </p>
          )}
        </address>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No delivery address was recorded for this order.
        </p>
      )}

      {trackingNumber && (
        <p className="mt-3 text-xs text-muted-foreground">
          Tracking number:{" "}
          <span className="font-mono font-semibold text-foreground">{trackingNumber}</span>
        </p>
      )}
    </section>
  );
}
