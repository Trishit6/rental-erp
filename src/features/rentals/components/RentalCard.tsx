import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Store } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { prefetchRental } from "../query";
import type { Rental } from "../types";
import { RentalCountdown } from "./RentalCountdown";
import { RentalDates } from "./RentalDates";
import { RentalProductPreview } from "./RentalProductPreview";
import { RentalStatusBadge } from "./RentalStatusBadge";

/**
 * One rental in the list.
 *
 * An active rental gets stronger hierarchy than a completed one: a wide bar, the
 * status at full size, and a countdown. A finished rental is quiet history and
 * does not need to shout for attention.
 *
 * The primary action is a real link, prefetched on hover or focus, so opening a
 * rental is instant and it still works with middle-click and "open in new tab".
 */
export function RentalCard({ rental }: { rental: Rental }) {
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const warm = useCallback(() => {
    void prefetchRental(queryClient, rental.id);
  }, [queryClient, rental.id]);

  const isActive = rental.isInHand;
  const isFinished = rental.bucket === "completed";

  return (
    <motion.article
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="raised-surface overflow-hidden rounded-3xl"
      data-testid={`rental-card-${rental.id}`}
    >
      {/* An active rental leads with a filled bar; everything else stays quiet. */}
      {isActive && (
        <div className="flex items-center justify-between gap-3 bg-accent/10 px-5 py-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-accent">
            Active rental
          </span>
          <RentalCountdown
            target={rental.endDate}
            active={rental.status === "ACTIVE" || rental.status === "OVERDUE"}
          />
        </div>
      )}

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <RentalProductPreview rental={rental} />
          <RentalStatusBadge status={rental.status} />
        </div>

        {rental.ownerName && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Store size={11} aria-hidden="true" />
            Rented from {rental.ownerName}
          </p>
        )}

        <RentalDates
          startDate={rental.startDate}
          endDate={rental.endDate}
          days={rental.days}
          returnedOn={rental.actualReturnDate}
          compact
        />

        {!isActive && (
          <RentalCountdown
            target={rental.startDate}
            mode="starts"
            active={rental.bucket === "upcoming"}
          />
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">
                {formatInr(rental.rentalSubtotal)}
              </span>{" "}
              rental
            </p>
            {rental.securityDeposit > 0 && (
              <p>
                <span className="font-semibold text-foreground">
                  {formatInr(rental.securityDeposit)}
                </span>{" "}
                security deposit
              </p>
            )}
          </div>

          <Link
            to="/rentals/$rentalId"
            params={{ rentalId: String(rental.id) }}
            onMouseEnter={warm}
            onFocus={warm}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              isFinished
                ? "soft-button text-foreground hover:text-primary"
                : "primary-button text-primary-foreground",
            )}
          >
            {isActive ? "Manage rental" : "View rental"}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
