import { PackageSearch } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Shown when the query returns nothing. Never renders placeholder products —
 * it explains how to widen the search instead.
 */
export function BrowseEmptyState({
  hasFilters,
  hasSearch,
  onClearFilters,
  onClearSearch,
}: {
  hasFilters: boolean;
  hasSearch: boolean;
  onClearFilters: () => void;
  onClearSearch: () => void;
}) {
  return (
    <EmptyState
      icon={PackageSearch}
      title="No products found"
      description="Try removing a filter or searching for something else."
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {hasFilters && (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
          {hasSearch && (
            <Button variant="secondary" size="sm" onClick={onClearSearch}>
              Clear search
            </Button>
          )}
        </div>
      }
    />
  );
}
