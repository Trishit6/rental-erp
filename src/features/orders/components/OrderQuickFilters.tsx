import { useMemo } from "react";
import { cn } from "@/lib/utils/cn";
import { Chip } from "./OrderStatusFilter";
import { ORDER_QUICK_FILTERS } from "./schema";
import type { OrdersSearch } from "./schema";

/**
 * The quick-filter pill row: All · Buying · Rentals · Rent + Buy · Processing ·
 * Shipped · Delivered · Completed · Cancelled.
 *
 * Each pill is a *view* of the URL state — none of them own state themselves —
 * so a pill, the sidebar filter and the back button always agree. The row
 * scrolls horizontally on narrow screens rather than wrapping into a wall.
 */
export function OrderQuickFilters({
  search,
  onChange,
}: {
  search: OrdersSearch;
  onChange: (patch: Partial<OrdersSearch>) => void;
}) {
  const activeId = useMemo(() => {
    for (const filter of ORDER_QUICK_FILTERS) {
      const patch = filter.patch as Partial<OrdersSearch>;
      const matches = Object.entries(patch).every(
        ([key, value]) => search[key as keyof OrdersSearch] === value,
      );
      if (matches && Object.keys(patch).length > 0) return filter.id;
    }
    return "all";
  }, [search]);

  return (
    <div
      role="group"
      aria-label="Quick filters"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {ORDER_QUICK_FILTERS.map((filter) => (
        <Chip
          key={filter.id}
          selected={activeId === filter.id}
          onClick={() => onChange(filter.patch as Partial<OrdersSearch>)}
        >
          {filter.label}
        </Chip>
      ))}
    </div>
  );
}

/**
 * A compact static summary of what the quick filters map to — exported for the
 * tests that assert the URL contract between pills and sidebar.
 */
export function quickFilterAriaLabel(filterId: string): string {
  const filter = ORDER_QUICK_FILTERS.find((entry) => entry.id === filterId);
  return cn(filter ? `Filter orders: ${filter.label}` : "Filter orders");
}
