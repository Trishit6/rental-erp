import { formatInr } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";

/**
 * What this rental cost, and what is still held.
 *
 * Every figure comes from the server. The three lines are kept apart on purpose:
 * the rental charge and the refundable deposit have completely different
 * outcomes, and folding them into one "total" is what makes customers believe
 * they are buying something they are only borrowing.
 *
 * Nothing here is summed from a live product price — the listing may have
 * changed since the booking, and a receipt must not.
 */
export function RentalPriceSummary({
  rental,
  className,
}: {
  rental: {
    dailyRate: number;
    rentalSubtotal: number;
    securityDeposit: number;
    deliveryFee: number;
    total: number;
    days: number;
    currency?: string;
  };
  className?: string;
}) {
  return (
    <dl className={cn("space-y-2.5 text-sm", className)} data-testid="rental-pricing">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">
          Rental price
          <span className="ml-1 text-[11px]">
            ({rental.days} day{rental.days === 1 ? "" : "s"})
          </span>
        </dt>
        <dd className="font-semibold tabular-nums">{formatInr(rental.rentalSubtotal)}</dd>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">Daily rate</dt>
        <dd className="text-muted-foreground tabular-nums">{formatInr(rental.dailyRate)}/day</dd>
      </div>

      {rental.deliveryFee > 0 && (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="font-semibold tabular-nums">{formatInr(rental.deliveryFee)}</dd>
        </div>
      )}

      {rental.securityDeposit > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Security deposit</dt>
            <dd className="font-semibold tabular-nums">{formatInr(rental.securityDeposit)}</dd>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Refundable — it is not part of the rental cost and comes back to you.
          </p>
        </div>
      )}

      <div className="neumo-divider" />
      <div className="flex items-baseline justify-between gap-3">
        <dt className="font-heading text-base font-extrabold">Total paid</dt>
        <dd className="font-heading text-base font-black tabular-nums">
          {formatInr(rental.total)}
          <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
            {rental.currency ?? "INR"}
          </span>
        </dd>
      </div>
    </dl>
  );
}
