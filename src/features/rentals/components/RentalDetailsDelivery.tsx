import { MapPin, Package, Phone, Store, Truck } from "lucide-react";
import type { RentalDelivery } from "../types";

/**
 * How the item got here, and how it goes back.
 *
 * Reads the **order's** address snapshot, not the customer's current profile
 * address. Editing your address next year must not rewrite where last year's
 * rental was delivered.
 *
 * The return note is deliberately generic: there is no courier or label
 * integration, so promising a pickup window or a shipping method would be a
 * claim nothing fulfils. The concrete action is the "Start return" button.
 */
export function RentalDetailsDelivery({ delivery }: { delivery: RentalDelivery }) {
  const isPickup = delivery.method === "PICKUP";

  return (
    <section className="raised-surface p-5" aria-labelledby="rental-delivery-heading">
      <h2
        id="rental-delivery-heading"
        className="flex items-center gap-2 font-heading text-lg font-extrabold"
      >
        {isPickup ? <Store size={16} aria-hidden="true" /> : <Truck size={16} aria-hidden="true" />}
        {isPickup ? "Pickup" : "Delivery"}
      </h2>

      {isPickup ? (
        <p className="mt-3 text-sm text-muted-foreground">
          You collect this from the seller. They&apos;ll be in touch to arrange a time.
        </p>
      ) : delivery.address ? (
        <address
          className="mt-3 space-y-1 text-sm not-italic text-muted-foreground"
          data-testid="rental-delivery-address"
        >
          {delivery.address.name && (
            <p className="font-semibold text-foreground">{delivery.address.name}</p>
          )}
          <p className="flex items-start gap-2">
            <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {[delivery.address.addressLine1, delivery.address.addressLine2]
                .filter(Boolean)
                .join(", ")}
              <br />
              {[delivery.address.city, delivery.address.state, delivery.address.postalCode]
                .filter(Boolean)
                .join(", ")}
              {delivery.address.country ? `, ${delivery.address.country}` : null}
            </span>
          </p>
          {delivery.address.phone && (
            <p className="flex items-center gap-2">
              <Phone size={12} aria-hidden="true" />
              {delivery.address.phone}
            </p>
          )}
        </address>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No delivery address was recorded for this order.
        </p>
      )}

      <div className="mt-4 rounded-xl bg-primary/8 p-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
          <Package size={12} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Returning it? Use <strong className="text-foreground">Start return</strong> below and
            the seller will confirm once the item is back.
          </span>
        </p>
      </div>
    </section>
  );
}
