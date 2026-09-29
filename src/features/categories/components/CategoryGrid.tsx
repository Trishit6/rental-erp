import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategorySummary } from "../types";
import { CategoryCard } from "./CategoryCard";

/** Responsive category grid — 1 column on phones through 4 on wide screens. */
export function CategoryGrid({
  categories,
  isLoading,
  onPrefetch,
  emptyState,
  skeletonCount = 8,
}: {
  categories: CategorySummary[];
  isLoading?: boolean;
  onPrefetch?: (slug: string) => void;
  emptyState?: ReactNode;
  skeletonCount?: number;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <div key={index} className="raised-surface space-y-3 rounded-2xl p-3">
            <Skeleton className="aspect-[16/10] w-full rounded-[14px]" />
            <Skeleton className="h-4 w-2/3 rounded-full" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!categories.length) return <>{emptyState}</>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} onPrefetch={onPrefetch} />
      ))}
    </div>
  );
}
