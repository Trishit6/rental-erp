import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder for the detail page.
 *
 * Mirrors the real two-column layout — header, items column, sticky summary —
 * rather than showing a centred spinner, so the page does not reflow when the
 * order arrives.
 */
export function OrderDetailsSkeleton() {
  return (
    <div className="page-wrap max-w-5xl space-y-5 pt-8" data-testid="order-details-skeleton">
      <Skeleton className="h-4 w-32" />

      <div className="raised-surface space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-40" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <div className="raised-surface space-y-4 p-5">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="size-16 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
          <div className="raised-surface h-48 p-5">
            <Skeleton className="h-4 w-28" />
          </div>
        </div>

        <div className="space-y-5">
          <div className="raised-surface h-64 p-5">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="raised-surface h-40 p-5">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
