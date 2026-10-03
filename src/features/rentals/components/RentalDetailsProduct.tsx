import { Link } from "@tanstack/react-router";
import { ExternalLink, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RentalProductPreview } from "./RentalProductPreview";
import type { Rental, RentalSeller } from "../types";

/**
 * The product being rented.
 *
 * Prefers the order-item snapshot, so a listing that has since been renamed does
 * not rewrite the rental record. Links to the existing `/product/$slug` page —
 * the brief said `/products/$productId`, but that route does not exist in this
 * app and inventing a second product-details surface is exactly what the brief
 * forbids.
 */
export function RentalDetailsProduct({
  rental,
  seller,
}: {
  rental: Rental;
  seller: RentalSeller | null;
}) {
  const hasLink = Boolean(rental.productSlug);
  const isRentToOwn = rental.listingType === "BOTH" || rental.rentCreditApplied > 0;

  return (
    <section className="raised-surface p-5" aria-labelledby="rental-product-heading">
      <h2 id="rental-product-heading" className="mb-3 font-heading text-lg font-extrabold">
        Item
      </h2>

      <RentalProductPreview rental={rental} size="lg" />

      <dl className="mt-4 space-y-2 text-sm">
        {rental.condition && <Row label="Condition" value={pretty(rental.condition)} />}
        <Row
          label="Listing mode"
          value={
            rental.listingType === "BOTH"
              ? "Rent & Buy"
              : rental.listingType === "RENT"
                ? "Rent"
                : "Sale"
          }
        />
        {seller && <Row label="Seller" value={seller.name} />}
      </dl>

      {hasLink && (
        <Button asChild variant="secondary" size="sm" className="mt-4">
          <Link to="/product/$slug" params={{ slug: rental.productSlug }}>
            <ExternalLink size={13} aria-hidden="true" />
            View product
          </Link>
        </Button>
      )}

      {isRentToOwn && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-accent/10 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <Repeat size={12} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          This listing can be rented or bought. Buying it after renting is not available yet — the
          credit shown above will be applied when it is.
        </p>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function pretty(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
