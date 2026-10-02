import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { SearchBar } from "@/components/shared/product-filters/SearchBar";
import { FavoritesFilters } from "./FavoritesFilters";
import { FavoritesSort } from "./FavoritesSort";
import type { FavoriteSearch, FavoriteSort } from "../types";

/**
 * Mobile controls.
 *
 * On a phone the three facets (search, sort, filters) collapse into one
 * full-height bottom sheet rather than three separate modals, and the desktop
 * filter sidebar is hidden below `lg`. Both surfaces read and write the same URL
 * search state, so a filter set on mobile is identical to one set on desktop and
 * survives a refresh either way.
 *
 * The trigger is a floating dock on the bottom-right, kept clear of the
 * bottom-right cart/quick-action dock by a safe-area aware bottom offset.
 */
export function MobileFavoritesToolbar({
  open,
  onOpenChange,
  search,
  activeCount,
  isSearching,
  onSearch,
  onChange,
  onClearAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: FavoriteSearch;
  activeCount: number;
  isSearching?: boolean;
  onSearch: (term: string) => void;
  onChange: (patch: Partial<FavoriteSearch>) => void;
  onClearAll: () => void;
}) {
  return (
    <>
      {/* Floating trigger, bottom-left so it never collides with the cart dock. */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label={`Filters and sort${activeCount > 0 ? `, ${activeCount} active` : ""}`}
        className="floating-dock fixed bottom-5 left-5 z-[var(--layer-floating)] flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-foreground shadow-lg lg:hidden"
      >
        <SlidersHorizontal size={16} aria-hidden className="text-primary" />
        Filters
        {activeCount > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>

      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title="Filters & sort"
        footer={
          <Button
            className="w-full"
            onClick={() => onOpenChange(false)}
            aria-label="Apply filters and close"
          >
            Show results
          </Button>
        }
      >
        <div className="space-y-6">
          {/* The same debounced, URL-backed field the desktop toolbar uses. */}
          <SearchBar
            id="favorites-search-mobile"
            label="Search saved products"
            placeholder="Search saved products…"
            value={search.search ?? ""}
            onSearch={onSearch}
            isSearching={isSearching}
          />

          <FavoritesSort
            id="favorites-sort-mobile"
            compact
            value={search.sort}
            onChange={(sort: FavoriteSort) => onChange({ sort })}
          />

          <div className="neumo-divider" />

          <FavoritesFilters
            search={search}
            activeCount={activeCount}
            onChange={onChange}
            onClearAll={onClearAll}
          />
        </div>
      </Sheet>
    </>
  );
}
