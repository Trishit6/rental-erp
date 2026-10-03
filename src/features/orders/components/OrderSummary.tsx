import { formatInr } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import type { OrderAmounts } from "../types";

/**
 * The money breakdown.
 *
 * Every figure is the server's; nothing here is computed from a product price.
 * The security deposit gets its own labelled row and the word "refundable",
 * because a deposit shown as an ordinary charge reads as a purchase — which is
 * how a customer ends up filing a refund request for money they are going to
 * get back anyway.
 */
export function OrderSummary({
  amounts,
  rentalAmount,
  hasDeposit = true,
  className,
}: {
  amounts: OrderAmounts;
  /** Sum of the order's rental charges, when the caller can derive it. */
  rentalAmount?: number;
  hasDeposit?: boolean;
  className?: string;
}) {
  const rows: { label: string; value: string; hint?: string }[] = [];

  // A rental amount is shown whenever there is one, and a "Purchase items" row
  // only when there is actually something purchased. A zero-amount purchase row
  // on a pure rental is noise that makes the totals look like a mistake.
  if (rentalAmount !== undefined && rentalAmount > 0) {
    const purchasePortion = amounts.subtotal - rentalAmount;
    if (purchasePortion > 0) {
      rows.push({ label: "Purchase items", value: formatInr(purchasePortion) });
    }
    rows.push({ label: "Rental charges", value: formatInr(rentalAmount) });
  } else {
    rows.push({ label: "Items", value: formatInr(amounts.subtotal) });
  }

  if (hasDeposit && amounts.depositTotal > 0) {
    rows.push({
      label: "Security deposit",
      value: formatInr(amounts.depositTotal),
      hint: "Refundable — returned after the item is handed back.",
    });
  }

  rows.push({
    label: "Delivery",
    value: amounts.deliveryFee > 0 ? formatInr(amounts.deliveryFee) : "Free pickup",
  });

  if (amounts.discount > 0)
    rows.push({ label: "Discount", value: `- ${formatInr(amounts.discount)}` });
  if (amounts.tax > 0) rows.push({ label: "Tax", value: formatInr(amounts.tax) });

  return (
    <dl className={cn("space-y-2 text-sm", className)} data-testid="order-summary">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-semibold tabular-nums">{row.value}</dd>
          </div>
          {row.hint && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{row.hint}</p>
          )}
        </div>
      ))}

      <div className="neumo-divider" />
      <div className="flex items-baseline justify-between gap-3">
        <dt className="font-heading text-base font-extrabold">Total</dt>
        <dd className="font-heading text-base font-black tabular-nums">
          {formatInr(amounts.total)}
          <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
            {amounts.currency}
          </span>
        </dd>
      </div>
    </dl>
  );
}
