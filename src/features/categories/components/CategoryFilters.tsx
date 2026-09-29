import { CategoryFilter } from "@/components/shared/product-filters/CategoryFilter";
import { FilterPanel } from "@/components/shared/product-filters/FilterPanel";
import type { CategorySearch, Subcategory } from "../types";

/**
 * Desktop filters for a category page: the shared sidebar plus one
 * category-specific group — "Subcategory" — where Browse puts "Category". The
 * shared groups (listing type, price, condition, availability) and their visual
 * language are identical on both pages, so this stays a scope, not a second
 * filtering experience.
 */
export function CategoryFilters({
  search,
  onChange,
  onClearAll,
  activeCount,
  subcategories,
  isLoadingSubcategories,
  idPrefix = "category",
}: {
  search: CategorySearch;
  onChange: (patch: Partial<CategorySearch>) => void;
  onClearAll: () => void;
  activeCount: number;
  subcategories: Subcategory[];
  isLoadingSubcategories?: boolean;
  idPrefix?: string;
}) {
  // A leaf category has no children — an "All"+nothing group would just be noise.
  const hasSubcategories = subcategories.length > 0 || isLoadingSubcategories;

  return (
    <FilterPanel
      search={search}
      activeCount={activeCount}
      idPrefix={idPrefix}
      onChange={onChange}
      onClearAll={onClearAll}
      leadGroup={
        hasSubcategories
          ? ({ search: current, onChange: patch }) => (
              <CategoryFilter
                title="Subcategory"
                categories={subcategories}
                isLoading={isLoadingSubcategories}
                value={current.subcategory}
                onChange={(subcategory) => patch({ subcategory })}
              />
            )
          : undefined
      }
    />
  );
}
