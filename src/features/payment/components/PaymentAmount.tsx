import { formatInr } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import type { PaymentBreakdown } from "../types";

/**
 * The amount, prominently and once.
 *
 * The figure is the server's — it arrives in `PaymentBreakdown` and is only
 * ever formatted here, never recalculated. Rental charges and the security
 * deposit are labelled separately so the customer can see which part of the
 * money comes back to them; folding them into one figure is what makes a
 * deposit read like a purchase.
 */
export function PaymentAmount({
  breakdown,
  className,
}: {
  breakdown: PaymentBreakdown;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <span className="text-sm font-medium text-muted-foreground">Amount to pay</span>
      <span
        className="font-heading text-3xl font-black tabular-nums"
        data-testid="payment-amount"
      >
        {formatInr(breakdown.grandTotal)}
      </span>
    </div>
  );
}
