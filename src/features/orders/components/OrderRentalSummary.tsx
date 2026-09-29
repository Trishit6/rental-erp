import { CalendarRange, Repeat } from "lucide-react";
import { format } from "date-fns";
import { formatInr, rentalDays } from "@/lib/pricing";
import { OrderStatusBadge } from "./OrderStatusBadge";
import type { OrderRental } from "../types";

/**
 * The rental details of an order.
 *
 * Read-only by design: this feature displays the rental information Feature 10
 * recorded and deliberately stops there. Returns, extensions, late fees and
 * rent-to-own conversion are separate features, and a button for them here would
 * be a button that leads nowhere.
 *
 * Rental charges and the security deposit are kept as separate rows, because
 * only one of them comes back.
 */
export function OrderRentalSummary({ rentals }: { rentals: OrderRental[] }) {
  if (rentals.length === 0) return null;

  return (
    <section className="raised-surface p-5" aria-labelledby="order-rental-heading">
      <h2
        id="order-rental-heading"
        className="flex items-center gap-2 font-heading text-lg font-extrabold"
      >
        <CalendarRange size={16} aria-hidden="true" />
        Rental Details
      </h2>

      <div className="mt-3 space-y-4" data-testid="order-rentals">
        {rentals.map((rental) => {
          const days = rentalDays({ startDate: rental.startDate, endDate: rental.endDate });

          return (
            <div key={rental.id} className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {format(new Date(rental.startDate), "d MMM yyyy")} →{" "}
                  {format(new Date(rental.endDate), "d MMM yyyy")}
                </p>
                <OrderStatusBadge status={rental.status} size="sm" />
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-semibold tabular-nums">
                    {days} day{days === 1 ? "" : "s"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Rental price</dt>
                  <dd className="font-semibold tabular-nums">{formatInr(rental.rentalSubtotal)}</dd>
                </div>
                {rental.securityDeposit > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">Security deposit</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatInr(rental.securityDeposit)}
                      </dd>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Refundable after the item is returned.
                    </p>
                  </div>
                )}
                {rental.rentCreditApplied > 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <Repeat size={12} aria-hidden="true" />
                      Rental credit applied
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {formatInr(rental.rentCreditApplied)}
                    </dd>
                  </div>
                )}
                {rental.actualReturnDate && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Returned on</dt>
                    <dd className="font-semibold">
                      {format(new Date(rental.actualReturnDate), "d MMM yyyy")}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
