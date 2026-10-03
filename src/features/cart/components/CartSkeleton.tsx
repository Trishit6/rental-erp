import { Skeleton } from "@/components/ui/skeleton";

/**
 * First-load skeleton for the cart.
 *
 * It reserves the real layout — a two-column grid on desktop, stacked on mobile
 * — so the page does not jump when the items arrive. A *background* refetch does
 * not use this: cached lines stay on screen (dimmed) instead, which is what lets
 * a quantity change land without the page flashing.
 */
export function CartSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"
      role="status"
      aria-label="Loading your cart"
    >
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="raised-surface rounded-3xl p-4">
            <div className="flex gap-4">
              <Skeleton className="size-20 shrink-0 rounded-2xl sm:size-24" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-40 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="raised-surface hidden h-fit rounded-3xl p-5 lg:block">
        <div className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="neumo-divider my-3" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
