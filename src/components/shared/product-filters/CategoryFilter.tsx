import { Skeleton } from "@/components/ui/skeleton";
import type { Category } from "@/lib/types";
import { ChoiceChip, FilterClear, FilterGroup } from "./ChoiceChip";

/**
 * Chipped category picker — options come from the API, never hardcoded. The title
 * is configurable so a category page can filter one level down ("Subcategory")
 * without a second near-identical component.
 */
export function CategoryFilter({
  categories,
  isLoading,
  value,
  onChange,
  title = "Category",
  allLabel = "All",
}: {
  categories?: Category[];
  isLoading?: boolean;
  value?: string;
  onChange: (slug?: string) => void;
  title?: string;
  allLabel?: string;
}) {
  return (
    <FilterGroup
      title={title}
      action={value ? <FilterClear onClick={() => onChange(undefined)} /> : undefined}
    >
      <ChoiceChip selected={!value} onClick={() => onChange(undefined)}>
        {allLabel}
      </ChoiceChip>

      {isLoading && !categories
        ? Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-24 rounded-full" />
          ))
        : (categories ?? []).map((category) => (
            <ChoiceChip
              key={category.id}
              selected={value === category.slug}
              onClick={() => onChange(value === category.slug ? undefined : category.slug)}
            >
              {category.name}
            </ChoiceChip>
          ))}
    </FilterGroup>
  );
}
