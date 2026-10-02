import { Skeleton, ProductGridSkeleton } from "@/components/ui/skeleton";
import { ProductImage } from "@/components/shared/product-image";
import type { ProductCardData } from "../types";

/**
 * Loading state that mirrors the real layout section for section, so nothing
 * jumps when content arrives. When the browse list already knows this product,
 * the real photo and title are shown instead of grey blocks — the page feels
 * instant without lying about data it doesn't have yet.
 */
export function ProductDetailsSkeleton({ preview }: { preview?: ProductCardData | null }) {
  return (
    <div className="page-wrap space-y-10 pb-16 pt-8" aria-busy="true" aria-live="polite">
      <Skeleton className="h-4 w-28" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="inset-surface rounded-[28px] p-3">
            {preview?.primaryImage ? (
              <ProductImage
                src={preview.primaryImage}
                alt=""
                className="aspect-[4/3] w-full rounded-[22px]"
              />
            ) : (
              <Skeleton className="aspect-[4/3] w-full rounded-[22px]" />
            )}
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="size-16 rounded-xl" />
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            {preview ? (
              <p className="font-heading text-2xl font-extrabold leading-tight sm:text-3xl">
                {preview.title}
              </p>
            ) : (
              <Skeleton className="h-9 w-3/4" />
            )}
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-20 w-full rounded-3xl" />
          <Skeleton className="h-14 w-full rounded-full" />
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-24 w-full rounded-3xl" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-20 w-full rounded-3xl" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <ProductGridSkeleton count={4} />
      </div>
    </div>
  );
}
