import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils/cn";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-2xl bg-[#ddd6c6]/70", className)}
      {...props}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="raised-surface rounded-3xl p-3.5">
      <div className="inset-surface rounded-[20px] p-2.5">
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
      </div>
      <div className="space-y-2 px-1 pb-1 pt-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="neumo-divider my-3" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
