import { PackageSearch } from "lucide-react";
import type { ProductCardData } from "../../lib/types";
import { ProductCard } from "./product-card";
import { EmptyState } from "./empty-state";
import { ProductGridSkeleton } from "../ui/skeleton";

/**
 * Responsive card grid. Exported so features (e.g. Browse) can lay out cards in
 * the same rhythm without re-declaring the columns.
 */
export const productGridClassName =
  "grid grid-cols-1 gap-4 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export function ProductGrid({
  products,
  isLoading,
  emptyMessage = "No items match that search yet. Try another keyword or category.",
}: {
  products: ProductCardData[];
  isLoading?: boolean;
  emptyMessage?: string;
}) {
  if (isLoading) return <ProductGridSkeleton />;
  if (!products.length) {
    return <EmptyState icon={PackageSearch} title="Nothing here yet" description={emptyMessage} />;
  }

  return (
    <div className={productGridClassName}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
