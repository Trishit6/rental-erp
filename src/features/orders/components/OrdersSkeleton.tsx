import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder that mirrors the real card's geometry, so the list does
 * not jump when data arrives. Each block lines up with the header strip, the
 * item preview and the footer of an actual `OrderCard`.
 */
export function OrdersSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4" data-testid="orders-skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="raised-surface space-y-4 rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="size-14 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
