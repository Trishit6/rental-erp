import { CalendarDays } from "lucide-react";
import { rentalDurationsFor } from "./schema";
import type { CartItem, UpdateCartItemInput } from "../types";

/**
 * Rental length. Shown only for a rental line.
 *
 * The options are the durations *this product* supports, derived from its own
 * minimum and maximum — never a fixed global list that could offer a 30-day
 * rental of something that only rents by the day. Changing it is a server-backed
 * cart update, because the duration decides both the price and the dates the
 * availability engine will check.
 */
export function RentalDurationControl({
  item,
  onUpdate,
  disabled,
}: {
  item: CartItem;
  onUpdate: (patch: UpdateCartItemInput) => void;
  disabled?: boolean;
}) {
  if (item.mode !== "RENT" || !item.product) return null;

  const options = rentalDurationsFor(item.product);
  if (options.length < 2) return null;

  const value = item.rentalDuration || options[0]!;
  const id = `rental-duration-${item.id}`;

  return (
    <div className="flex items-center gap-2">
      <CalendarDays size={13} aria-hidden className="shrink-0 text-primary" />
      <label htmlFor={id} className="sr-only">
        Rental duration for {item.product.title}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const days = Number(event.target.value);
          if (!Number.isFinite(days) || days === value) return;
          onUpdate(rentalDurationPatch(item, days));
        }}
        className="inset-surface h-8 rounded-full px-2.5 text-xs font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
      >
        {options.map((days) => (
          <option key={days} value={days}>
            {days} {days === 1 ? "day" : "days"}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Turn a duration into the date window the server stores, anchored to the line's
 * existing start date so a later change does not silently move the rental.
 */
export function rentalDurationPatch(item: CartItem, days: number): UpdateCartItemInput {
  const start = item.startDate ? new Date(item.startDate) : new Date();
  // Day precision: the column stores a date, so add whole days in UTC to keep
  // `rentalDays` round-tripping exactly.
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + days);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}
