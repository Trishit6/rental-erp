import { Skeleton } from "@/components/ui/skeleton";
import type { Subcategory } from "../types";
import { CategoryCard } from "./CategoryCard";

/**
 * A category's children, shown prominently under the header.
 *
 * Desktop: a compact grid of tiles. Mobile: the same tiles in a horizontal scroll,
 * so a category with eight children never pushes the products below the fold.
 * Renders nothing at all when the category is a leaf.
 */
export function SubcategoryList({
  subcategories,
  isLoading,
  onPrefetch,
}: {
  subcategories: Subcategory[];
  isLoading?: boolean;
  onPrefetch?: (slug: string) => void;
}) {
  if (isLoading) {
    return (
      <section className="space-y-4" aria-label="Subcategories">
        <Skeleton className="h-4 w-32 rounded-full" />
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[74px] w-[150px] shrink-0 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  if (!subcategories.length) return null;

  return (
    <section className="space-y-4" aria-labelledby="subcategories-heading">
      <h2 id="subcategories-heading" className="eyebrow">
        Subcategories
      </h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {subcategories.map((subcategory) => (
          <div key={subcategory.id} className="w-[172px] shrink-0 sm:w-auto">
            <CategoryCard category={subcategory} variant="tile" onPrefetch={onPrefetch} />
          </div>
        ))}
      </div>
    </section>
  );
}
