import { Link } from "@tanstack/react-router";
import { CalendarPlus, PackageCheck, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Rental, RentalDetailsResponse } from "../types";

/**
 * What the customer can actually do with this rental, right now.
 *
 * The buttons are driven by the **server's** `eligibility` flags, not by a
 * guess in the client. That is deliberate: if the rules change, the UI changes
 * with them, and a stale client cannot show an action the server would refuse.
 *
 * There is no "Contact seller" — messaging is its own feature — and no
 * "Extend rental" for a rental that has already been returned, because the
 * server says it is not extendable and offering it anyway would be a lie about
 * what will happen when the customer presses it.
 */
export function RentalDetailsActions({
  rental,
  details,
  onExtend,
  onReturn,
}: {
  rental: Rental;
  details: RentalDetailsResponse;
  onExtend: () => void;
  onReturn: () => void;
}) {
  const { eligibility } = details;
  const returnRequested = rental.status === "RETURN_PENDING";
  const finished = rental.bucket === "completed";

  return (
    <section className="raised-surface p-5" aria-labelledby="rental-actions-heading">
      <h2 id="rental-actions-heading" className="font-heading text-lg font-extrabold">
        Actions
      </h2>

      <div className="mt-3 flex flex-col gap-2.5">
        {eligibility.canExtend && !finished && (
          <Button onClick={onExtend} disabled={Boolean(rental.extensionRequestedAt)}>
            <CalendarPlus size={14} aria-hidden="true" />
            {rental.extensionRequestedAt
              ? `Extension requested (${rental.extensionRequestedDays}d)`
              : "Extend rental"}
          </Button>
        )}

        {eligibility.canRequestReturn && !returnRequested && !finished && (
          <Button variant="secondary" onClick={onReturn}>
            <PackageCheck size={14} aria-hidden="true" />
            Start return
          </Button>
        )}

        {returnRequested && (
          <p
            className="rounded-xl bg-primary/10 p-3 text-xs leading-relaxed text-muted-foreground"
            data-testid="rental-return-requested"
          >
            <strong className="text-foreground">Return requested.</strong> Your rental return has
            been initiated. Hand the item to the seller — they&apos;ll confirm once it is back, and
            your deposit is released after that.
          </p>
        )}

        {rental.orderNumber && (
          <Button asChild variant="secondary">
            <Link to="/orders/$orderId" params={{ orderId: rental.orderNumber }}>
              <Receipt size={14} aria-hidden="true" />
              View order
            </Link>
          </Button>
        )}
      </div>

      {finished && !returnRequested && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          This rental is finished, so it can no longer be extended or returned.
        </p>
      )}
    </section>
  );
}
