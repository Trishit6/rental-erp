import { ArrowUpDown } from "lucide-react";
import { RENTAL_SORT_OPTIONS, type RentalSort } from "./schema";

/**
 * Sort control.
 *
 * A native `<select>`: on mobile it opens the platform picker, which is faster
 * and more accessible than a custom menu and needs no focus management of its
 * own. "Ending soon" and "starting soon" are ordered by the server against the
 * real dates, not in the browser.
 */
export function RentalsSort({
  value,
  onChange,
}: {
  value: RentalSort;
  onChange: (sort: RentalSort) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="rentals-sort"
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
      >
        <ArrowUpDown size={13} aria-hidden="true" />
        Sort
      </label>
      <select
        id="rentals-sort"
        value={value}
        onChange={(event) => onChange(event.target.value as RentalSort)}
        className="inset-surface h-10 rounded-full px-3 pr-8 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {RENTAL_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
