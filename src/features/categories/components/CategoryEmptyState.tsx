import { Link } from "@tanstack/react-router";
import { PackageSearch } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * No products matched inside this category. Never a blank screen: it explains what
 * happened and offers two ways out — widen the filters, or leave for the full
 * catalogue. Mirrors Browse's empty state so the two read the same.
 */
export function CategoryEmptyState({
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
      description="Try changing your filters or exploring another category."
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
          <Button asChild size="sm">
            <Link to="/browse">Browse all products</Link>
          </Button>
        </div>
      }
    />
  );
}
