import { MapPin, Package } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import type { PaymentSummary as PaymentSummaryType } from "../types";
import { PaymentAmount } from "./PaymentAmount";

/**
 * The order breakdown.
 *
 * The security deposit gets its own labelled row with the word "refundable",
 * because it is money the customer is handing over and expects back — a deposit
 * presented as an ordinary charge reads as a purchase and generates refunds
 * requests later. Rental charges are likewise separated from purchases so a
 * rental is never mistaken for owning the thing.
 */
export function PaymentSummary({ summary }: { summary: PaymentSummaryType }) {
  const { breakdown, lines, deliveryAddress, deliveryMethod } = summary;
  const hasRentals = lines.some((line) => line.mode === "RENT");
  const hasPurchases = lines.some((line) => line.mode === "BUY");

  return (
    <section className="space-y-4" aria-labelledby="payment-summary-heading">
      <h2 id="payment-summary-heading" className="font-heading text-lg font-extrabold">
        Order summary
      </h2>

      <ul className="space-y-3" data-testid="payment-lines">
        {lines.map((line) => (
          <li key={line.cartItemId} className="flex items-center gap-3">
            <span className="soft-button flex size-10 shrink-0 items-center justify-center rounded-xl text-primary">
              <Package size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {line.title}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {line.mode === "RENT"
                  ? `Rental · ${line.rentalDays ?? line.pricing.days} day${
                      (line.rentalDays ?? line.pricing.days) === 1 ? "" : "s"
                    } · ×${line.quantity}`
                  : `Purchase · ×${line.quantity}`}
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold tabular-nums">
              {formatInr(line.pricing.lineTotal)}
            </span>
          </li>
        ))}
      </ul>

      <div className="neumo-divider" />

      <dl className="space-y-2.5 text-sm">
        {hasPurchases && hasRentals ? (
          <>
            <Row
              label="Purchase items"
              value={formatInr(breakdown.subtotal - breakdown.rentalAmount)}
            />
            <Row label="Rental charges" value={formatInr(breakdown.rentalAmount)} />
          </>
        ) : hasRentals ? (
          <Row label="Rental charges" value={formatInr(breakdown.rentalAmount)} />
        ) : (
          <Row label="Subtotal" value={formatInr(breakdown.subtotal)} />
        )}

        <Row
          label="Delivery"
          value={breakdown.deliveryFee > 0 ? formatInr(breakdown.deliveryFee) : "Free pickup"}
        />

        {breakdown.securityDeposit > 0 && (
          <div className="rounded-xl bg-accent/10 p-3">
            <Row
              label="Security deposit (refundable)"
              value={formatInr(breakdown.securityDeposit)}
              hint="Held against damage and returned to you after the item is returned."
            />
          </div>
        )}

        {breakdown.discount > 0 && (
          <Row label="Discount" value={`- ${formatInr(breakdown.discount)}`} />
        )}
        {breakdown.tax > 0 && <Row label="Tax" value={formatInr(breakdown.tax)} />}
      </dl>

      <div className="neumo-divider" />

      <PaymentAmount breakdown={breakdown} />

      <p className="text-[11px] text-muted-foreground">
        All amounts in {breakdown.currency}. Charged in whole{" "}
        {breakdown.currency === "INR" ? "rupees" : breakdown.currency}.
      </p>

      {deliveryMethod === "PICKUP" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Package size={13} aria-hidden="true" />
          Pickup from the seller. You will be contacted to arrange a time.
        </p>
      ) : deliveryAddress ? (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Delivering to {deliveryAddress.name}, {deliveryAddress.addressLine1}
            {deliveryAddress.addressLine2 ? `, ${deliveryAddress.addressLine2}` : ""},{" "}
            {deliveryAddress.city}, {deliveryAddress.state} {deliveryAddress.postalCode}
          </span>
        </p>
      ) : null}
    </section>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-semibold tabular-nums">{value}</dd>
      </div>
      {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
