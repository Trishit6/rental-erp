import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { SearchBar } from "@/components/shared/product-filters/SearchBar";
import { ChoiceChip } from "@/components/shared/product-filters/ChoiceChip";
import { MODE_OPTIONS } from "@/lib/product-search/schema";
import { FavoritesSort } from "./FavoritesSort";
import type { ActiveFavoriteFilter, FavoriteSearch, FavoriteSort, ListingMode } from "../types";

/**
 * The lightweight toolbar: search, a quick listing-type switch, sort, and pills
 * for whatever else is narrowing the list.
 *
 * Search is committed to the URL like everything else, so it reaches the server
 * (the wishlist is never downloaded whole to be filtered in the browser) and a
 * shared link reproduces the same view.
 */
export function FavoritesToolbar({
  search,
  filters,
  onChange,
  onSearch,
  onClearAll,
  isSearching,
  sortId = "favorites-sort",
}: {
  search: FavoriteSearch;
  /** The active-filter pills, computed by the page. */
  filters: ActiveFavoriteFilter[];
  /** Filter/sort changes always go through here; the page resets the page. */
  onChange: (patch: Partial<FavoriteSearch>) => void;
  onSearch: (term: string) => void;
  onClearAll: () => void;
  isSearching?: boolean;
  sortId?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="raised-surface flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center">
        <SearchBar
          id="favorites-search"
          label="Search saved products"
          placeholder="Search saved products…"
          value={search.search ?? ""}
          onSearch={onSearch}
          isSearching={isSearching}
        />
        <FavoritesSort
          id={sortId}
          value={search.sort}
          onChange={(sort: FavoriteSort) => onChange({ sort })}
        />
      </div>

      {/* The one glanceable switch. Full condition/availability facets live in
          the filter panel — this row is the fast path, not the whole surface. */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter by listing type"
      >
        <ChoiceChip selected={!search.listingType} onClick={() => onChange({ listingType: undefined })}>
          All
        </ChoiceChip>
        {MODE_OPTIONS.map((option) => (
          <ChoiceChip
            key={option.value}
            selected={search.listingType === option.value}
            onClick={() =>
              onChange({
                listingType:
                  search.listingType === (option.value as ListingMode)
                    ? undefined
                    : (option.value as ListingMode),
              })
            }
          >
            {option.label === "Rent + Buy" ? "Rent & Buy" : option.label}
          </ChoiceChip>
        ))}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {filters.map((filter) => (
            <span
              key={filter.key}
              className="inset-surface inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-xs font-bold text-foreground"
            >
              {filter.label}
              <button
                type="button"
                onClick={() => {
                  const patch: Partial<FavoriteSearch> = {};
                  for (const key of filter.clear) patch[key] = undefined;
                  onChange(patch);
                }}
                aria-label={`Remove filter: ${filter.label}`}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="ml-1 text-xs font-bold text-primary underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Clear all
          </button>
        </div>
      )}
    </motion.div>
  );
}
