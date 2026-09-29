import { format } from "date-fns";
import { CalendarRange, Loader2 } from "lucide-react";
import { formatInr, quoteRental } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import type { ProductDetails, RentalOption } from "../types";

/**
 * Rental length. The options themselves are derived from the product's own
 * min/max window (see `buildRentalOptions`), so an invalid duration can't be
 * chosen in the first place — the backend re-checks regardless.
 */
export function RentalDurationSelector({
  product,
  options,
  value,
  onChange,
  checking = false,
  unavailable = false,
}: {
  product: ProductDetails;
  options: RentalOption[];
  value: number | null;
  onChange: (days: number) => void;
  checking?: boolean;
  /** The chosen window is already booked out. */
  unavailable?: boolean;
}) {
  if (options.length === 0) return null;

  const selected = options.find((option) => option.days === value) ?? options[0];
  const quote = quoteRental(product, {
    startDate: selected.startDate,
    endDate: selected.endDate,
  });

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <CalendarRange size={13} aria-hidden />
          Rental duration
        </p>
        {checking && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            Checking dates…
          </span>
        )}
      </div>

      <div role="radiogroup" aria-label="Rental duration" className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = option.days === selected.days;
          return (
            <button
              key={option.days}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(option.days)}
              className={cn(
                "rounded-full px-3.5 py-2 text-xs font-bold transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isSelected
                  ? "primary-button text-primary-foreground"
                  : "inset-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <p className={cn("text-xs text-muted-foreground", unavailable && "text-primary")}>
        {format(new Date(selected.startDate), "d MMM")} →{" "}
        {format(new Date(selected.endDate), "d MMM")} ·{" "}
        <span className="font-semibold text-foreground">
          {formatInr(quote.dailyRate)} × {quote.days} {quote.days === 1 ? "day" : "days"} ={" "}
          {formatInr(quote.rentalSubtotal)}
        </span>
      </p>
    </div>
  );
}
