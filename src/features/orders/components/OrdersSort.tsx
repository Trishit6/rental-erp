import { ArrowUpDown } from "lucide-react";
import { ORDER_SORT_OPTIONS, type OrderSort } from "./schema";

/**
 * Sort control.
 *
 * A native `<select>` on purpose: on mobile it opens the platform's own picker,
 * which is faster and more accessible than a custom menu, and it needs no focus
 * management of its own. Only orderings the server can actually perform are
 * offered.
 */
export function OrdersSort({
  value,
  onChange,
}: {
  value: OrderSort;
  onChange: (sort: OrderSort) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="orders-sort"
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
      >
        <ArrowUpDown size={13} aria-hidden="true" />
        Sort
      </label>
      <select
        id="orders-sort"
        value={value}
        onChange={(event) => onChange(event.target.value as OrderSort)}
        className="inset-surface h-10 rounded-full px-3 pr-8 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {ORDER_SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
