import { useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { addDays, formatInr } from "@/lib/pricing";
import { formatDateLong } from "./RentalDates";
import { extensionRequestSchema, EXTENSION_DAY_OPTIONS, MAX_EXTENSION_DAYS } from "./schema";
import type { Rental, RentalExtensionQuote } from "../types";

/**
 * Ask for extra rental time.
 *
 * What the dialog shows before submitting, and why:
 *
 *  - The **current end date** is the server's, so it is safe to show.
 *  - The **projected end date** is plain date arithmetic on that value, labelled
 *    "estimate" because it is one. The server recomputes it and its answer wins.
 *  - The **price of the extra days is deliberately absent.** Computing it here
 *    would mean pricing from the listing as it is *now*, which is precisely the
 *    thing a receipt must not do — the customer agreed to a rate for their
 *    original window, and the effective rate for a longer one can differ. The
 *    quote comes back from the server after the request, and only that is
 *    presented as a cost.
 *
 * The button is not gated on the client's own opinion of eligibility: the server
 * decides, and a refusal is shown verbatim.
 */
export function RentalExtensionDialog({
  open,
  onOpenChange,
  rental,
  isSubmitting,
  quote,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rental: Rental;
  isSubmitting: boolean;
  quote: RentalExtensionQuote | null;
  onSubmit: (additionalDays: number) => void;
}) {
  const [days, setDays] = useState(3);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Whole days the current rental already covers, so a max-duration refusal can
  // be flagged early — though the server re-checks it regardless.
  const daysAlreadyRented = Math.max(1, rental.days);
  const projectedEnd = addDays(new Date(rental.endDate), days);

  function submit() {
    // The same bounds the server enforces, checked here only to avoid a pointless
    // round trip. This is validation, not authorisation.
    const parsed = extensionRequestSchema.safeParse({ additionalDays: days });
    if (!parsed.success) {
      setValidationError(`Choose between 1 and ${MAX_EXTENSION_DAYS} days.`);
      return;
    }
    setValidationError(null);
    onSubmit(parsed.data.additionalDays);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Extend rental"
      description="Request more time. The owner confirms before anything changes."
      footer={
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                Requesting…
              </>
            ) : (
              "Request extension"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        <dl className="inset-surface space-y-2 rounded-2xl p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Current end date</dt>
            <dd className="font-semibold">{formatDateLong(rental.endDate)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Currently rented for</dt>
            <dd className="font-semibold">
              {daysAlreadyRented} day{daysAlreadyRented === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>

        <fieldset>
          <legend className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Extend by
          </legend>
          <div className="flex flex-wrap gap-2">
            {EXTENSION_DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                aria-pressed={days === option}
                className={
                  days === option
                    ? "primary-button rounded-full px-4 py-2 text-xs font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    : "inset-surface rounded-full px-4 py-2 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                }
              >
                {option} day{option === 1 ? "" : "s"}
              </button>
            ))}
          </div>
        </fieldset>

        <dl className="inset-surface space-y-2 rounded-2xl p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">New end date (estimate)</dt>
            <dd className="font-semibold">{formatDateLong(projectedEnd.toISOString())}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">Additional rental cost</dt>
            <dd className="font-semibold" data-testid="extension-cost">
              {quote ? formatInr(quote.additionalCost) : "Checked on request"}
            </dd>
          </div>
        </dl>

        {quote && (
          <div
            className="rounded-2xl bg-accent/10 p-4 text-xs leading-relaxed text-muted-foreground"
            data-testid="extension-requested"
          >
            <p className="flex items-center gap-1.5 font-bold text-foreground">
              <CalendarPlus size={12} aria-hidden="true" />
              Extension requested
            </p>
            <p className="mt-1">
              We&apos;ve asked for {quote.additionalDays} more day
              {quote.additionalDays === 1 ? "" : "s"} and will confirm the end date and price before
              anything changes. Your current end date{" "}
              {formatDateLong(quote.currentEndDate)} still stands until then.
            </p>
          </div>
        )}

        {validationError && (
          <p role="alert" className="text-xs text-destructive">
            {validationError}
          </p>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Extensions depend on the item being free for the extra time. If someone else has booked
          after your current period, we&apos;ll say so and nothing will change.
        </p>

        <p className="sr-only" aria-live="polite">
          {quote
            ? `Extension requested for ${quote.additionalDays} additional days, cost ${formatInr(quote.additionalCost)}.`
            : ""}
        </p>
      </div>
    </Sheet>
  );
}
