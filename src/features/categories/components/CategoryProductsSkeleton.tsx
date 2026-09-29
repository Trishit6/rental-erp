import { ProductGridSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Layout-shaped skeleton for a category page: breadcrumbs, header, subcategories,
 * the filter sidebar and the card grid all occupy their real positions, so the page
 * doesn't jump when the data arrives. Only shown when there is no cached data —
 * a background refetch keeps the current results instead (see `CategoryProducts`).
 */
export function CategoryProductsSkeleton() {
  return (
    <div className="page-wrap space-y-6 pb-24 pt-8 lg:pb-10" aria-busy="true">
      <Skeleton className="h-4 w-52 rounded-full" />

      <div className="raised-surface flex flex-col gap-5 rounded-3xl p-5 sm:flex-row sm:items-center sm:p-6">
        <Skeleton className="size-28 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-20 rounded-full" />
          <Skeleton className="h-8 w-64 rounded-xl" />
          <Skeleton className="h-3 w-full max-w-md rounded-full" />
          <Skeleton className="h-3 w-40 rounded-full" />
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-4 w-32 rounded-full" />
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[74px] w-[172px] shrink-0 rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[268px_minmax(0,1fr)]">
        <div className="raised-surface hidden space-y-5 rounded-3xl p-5 lg:block">
          <Skeleton className="h-4 w-20 rounded-full" />
          <div className="neumo-divider" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2.5">
              <Skeleton className="h-3 w-24 rounded-full" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-8 w-16 rounded-full" />
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>

        <ProductGridSkeleton count={8} />
      </div>
    </div>
  );
}
