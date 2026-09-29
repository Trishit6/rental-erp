import { Skeleton } from "@/components/ui/skeleton";

/**
 * List placeholder that mirrors a real `RentalCard`, so the page does not jump
 * when the data lands. The active-rental bar is included because most cards
 * render one.
 */
export function RentalSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" data-testid="rentals-skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="raised-surface overflow-hidden rounded-3xl">
          <div className="h-9 animate-pulse bg-accent/10" />
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Skeleton className="size-16 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
            <div className="flex items-end justify-between gap-3">
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-9 w-32 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
