import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarRange } from "lucide-react";
import { formatDateLong } from "./RentalDates";
import { RentalStatusBadge } from "./RentalStatusBadge";
import type { Rental } from "../types";

/**
 * The detail page header.
 *
 * `Back to My Rentals` is a real link, not `history.back()`, so it works when the
 * page was opened directly from a shared URL — a back button that only works if
 * you arrived from somewhere is a trap.
 *
 * The reference shown is the **order number**, not the rental's auto-increment
 * id. A URL is user-visible and shareable, and a sequential id leaks how much
 * business the marketplace does; the product line distinguishes rentals when one
 * order contains several.
 */
export function RentalDetailsHeader({ rental }: { rental: Rental }) {
  return (
    <header className="space-y-4">
      <Link
        to="/rentals"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Back to My Rentals
      </Link>

      <div className="raised-surface space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5">
              <CalendarRange size={12} aria-hidden="true" />
              Rental details
            </p>
            <h1 className="section-title mt-1 text-2xl">
              {rental.orderNumber ? `Order #${rental.orderNumber}` : "Rental"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateLong(rental.startDate)} → {formatDateLong(rental.endDate)}
            </p>
          </div>
          <RentalStatusBadge status={rental.status} />
        </div>

        {rental.rentCreditApplied > 0 && (
          <p className="rounded-xl bg-accent/10 p-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Rent-to-own eligible.</strong> Rent credit of{" "}
            {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
              rental.rentCreditApplied / 100,
            )}{" "}
            has already been credited against this item. Converting it to a purchase is not
            available yet.
          </p>
        )}
      </div>
    </header>
  );
}
