import { RentalDates } from "./RentalDates";
import { RentalPriceSummary } from "./RentalPriceSummary";
import { RentalSecurityDeposit } from "./RentalSecurityDeposit";
import type { Rental } from "../types";

/**
 * Money and dates for one rental.
 *
 * Grouped into one section because they are the three questions a customer has
 * about a rental — when, what it cost, and when they get the deposit back — and
 * answering them together avoids a hunt.
 */
export function RentalDetailsPricing({ rental }: { rental: Rental }) {
  return (
    <section className="raised-surface space-y-4 p-5" aria-labelledby="rental-pricing-heading">
      <h2 id="rental-pricing-heading" className="font-heading text-lg font-extrabold">
        Pricing
      </h2>

      <RentalPriceSummary rental={{ ...rental, currency: "INR" }} />

      <div className="neumo-divider" />

      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Dates</h3>
      <RentalDates
        startDate={rental.startDate}
        endDate={rental.endDate}
        days={rental.days}
        returnedOn={rental.actualReturnDate}
      />

      <RentalSecurityDeposit amount={rental.securityDeposit} status={rental.depositStatus} />
    </section>
  );
}
