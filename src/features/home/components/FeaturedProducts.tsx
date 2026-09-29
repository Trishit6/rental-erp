import { ProductGrid } from "@/components/shared/product-grid";
import type { ProductCardData } from "@/lib/types";
import { ProductSection } from "./ProductSection";

/**
 * Featured products on Home — real API data via the shared ProductGrid
 * (spec §20/§21). The grid's ProductCard is reusable across Browse, Search,
 * Category, Favorites and Home.
 */
export function FeaturedProducts({
  products,
  isLoading,
  isError,
  onRetry,
}: {
  products: ProductCardData[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  return (
    <ProductSection
      id="featured"
      eyebrow="Good things, close by"
      title="Fresh near you"
      subtitle="Rent it, buy it outright, or find a new favourite."
      linkLabel="View all items"
      products={products}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyMessage="No featured items right now. Check back soon."
    >
      {(items) => <ProductGrid products={items} />}
    </ProductSection>
  );
}
