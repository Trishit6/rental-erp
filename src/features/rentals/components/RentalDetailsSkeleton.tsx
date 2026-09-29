import { Skeleton } from "@/components/ui/skeleton";

/**
 * Detail placeholder mirroring the real two-column layout — header, item and
 * timeline on the left, pricing and actions on the right — rather than a
 * centred spinner, so the page does not reflow when the rental arrives.
 */
export function RentalDetailsSkeleton() {
  return (
    <div className="page-wrap max-w-5xl space-y-5 pt-8" data-testid="rental-details-skeleton">
      <Skeleton className="h-4 w-36" />

      <div className="raised-surface space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-52" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div className="space-y-5">
          <div className="raised-surface space-y-4 p-5">
            <Skeleton className="h-4 w-16" />
            <div className="flex items-center gap-4">
              <Skeleton className="size-24 rounded-3xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <Skeleton className="h-40" />
          </div>
          <div className="raised-surface p-5">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 space-y-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="raised-surface h-64 p-5">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-4 w-full" />
              ))}
            </div>
          </div>
          <div className="raised-surface h-44 p-5">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="raised-surface h-36 p-5">
            <Skeleton className="h-9 w-full rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
