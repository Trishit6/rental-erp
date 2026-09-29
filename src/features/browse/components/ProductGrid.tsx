import type { ReactNode } from "react";
import { ProductCard } from "@/components/shared/product-card";
import { productGridClassName } from "@/components/shared/product-grid";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import type { ListingMode, ProductListItem } from "../types";

/**
 * Browse results grid. Reuses the shared ProductCard (the one card used by Home
 * too) and just threads the browse context through: the active listing mode and
 * a per-card prefetch hook.
 */
export function ProductGrid({
  products,
  isLoading,
  mode,
  onPrefetch,
  emptyState,
}: {
  products: ProductListItem[];
  isLoading?: boolean;
  mode?: ListingMode;
  onPrefetch?: (slug: string) => void;
  emptyState?: ReactNode;
}) {
  if (isLoading) return <ProductGridSkeleton count={8} />;
  if (!products.length) return <>{emptyState}</>;

  return (
    <div className={productGridClassName}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          mode={mode}
          onPrefetch={onPrefetch ? () => onPrefetch(product.slug) : undefined}
        />
      ))}
    </div>
  );
}
