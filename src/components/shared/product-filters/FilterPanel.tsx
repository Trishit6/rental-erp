import type { ReactNode } from "react";
import type { ProductSearch } from "@/lib/product-search/types";
import { AvailabilityFilter } from "./AvailabilityFilter";
import { ConditionFilter } from "./ConditionFilter";
import { ListingTypeFilter } from "./ListingTypeFilter";
import { PriceFilter } from "./PriceFilter";

/**
 * The scope-specific group a feature renders above the shared ones — Browse puts
 * its "Category" chips there, a category page its "Subcategory" chips. It receives
 * the live search state so it edits exactly what the page reads from the URL.
 */
export type FilterGroupSlot = (args: {
  search: ProductSearch;
  onChange: (patch: Partial<ProductSearch>) => void;
}) => ReactNode;

/**
 * Desktop filter sidebar, shared by Browse and category pages. Filters apply
 * immediately on desktop; the mobile sheet reuses these same groups against a
 * draft so the two stay consistent.
 */
export function FilterPanel({
  search,
  onChange,
  onClearAll,
  activeCount,
  leadGroup,
  idPrefix,
}: {
  search: ProductSearch;
  onChange: (patch: Partial<ProductSearch>) => void;
  onClearAll: () => void;
  /** How many filters are narrowing the results — drives the "Clear all (n)" label. */
  activeCount: number;
  leadGroup?: FilterGroupSlot;
  /** Unique-ish prefix so two panels on one page never share input ids. */
  idPrefix?: string;
}) {
  return (
    <aside aria-label="Filters" className="hidden lg:block">
      <div className="raised-surface sticky top-24 max-h-[calc(100vh-8rem)] space-y-5 overflow-y-auto rounded-3xl p-5 [scrollbar-width:thin]">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-extrabold">Filters</h2>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] font-bold text-primary underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Clear all ({activeCount})
            </button>
          )}
        </div>

        <div className="neumo-divider" />

        {leadGroup?.({ search, onChange })}

        <ListingTypeFilter value={search.mode} onChange={(mode) => onChange({ mode })} />

        <PriceFilter
          min={search.minPrice}
          max={search.maxPrice}
          mode={search.mode}
          idPrefix={idPrefix}
          onChange={(minPrice, maxPrice) => onChange({ minPrice, maxPrice })}
        />

        <ConditionFilter
          value={search.condition}
          onChange={(condition) => onChange({ condition })}
        />

        <AvailabilityFilter
          value={search.availability}
          onChange={(availability) => onChange({ availability })}
        />
      </div>
    </aside>
  );
}
