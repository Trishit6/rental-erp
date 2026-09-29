import { AvailabilityFilter } from "@/components/shared/product-filters/AvailabilityFilter";
import { ConditionFilter } from "@/components/shared/product-filters/ConditionFilter";
import { ListingTypeFilter } from "@/components/shared/product-filters/ListingTypeFilter";
import type { ConditionFilterValue, FavoriteSearch, ListingMode, ProductAvailability } from "../types";

/**
 * Wishlist filters.
 *
 * It reuses the exact filter groups Browse renders — same chips, same words,
 * same behaviour — rather than inventing a second look. What is different is
 * only the set: a saved list is scoped to "things you own", so there is no
 * category or price facet here.
 *
 * Rendered on the desktop as a sidebar and inside the mobile sheet, so both
 * read and write the same URL state.
 */
export function FavoritesFilters({
  search,
  activeCount,
  onChange,
  onClearAll,
}: {
  search: FavoriteSearch;
  onChange: (patch: Partial<FavoriteSearch>) => void;
  onClearAll: () => void;
  activeCount: number;
}) {
  return (
    <div className="space-y-5">
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

      <ListingTypeFilter
        value={search.listingType}
        onChange={(listingType?: ListingMode) => onChange({ listingType })}
      />
      <ConditionFilter
        value={search.condition}
        onChange={(condition?: ConditionFilterValue) => onChange({ condition })}
      />
      <AvailabilityFilter
        value={search.availability}
        onChange={(availability?: ProductAvailability) => onChange({ availability })}
      />
    </div>
  );
}
