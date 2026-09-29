import { ProductGrid } from "@/components/shared/product-grid";
import type { ProductCardData } from "@/lib/types";
import { ProductSection } from "./ProductSection";

/** Pre-loved highlight section (spec §24) — sustainability without preaching. */
export function PreLovedSection({
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
      id="pre-loved"
      eyebrow="Second life, first choice"
      title="Good products deserve another life."
      subtitle="Condition clearly marked on every listing."
      linkTo="/pre-loved"
      linkLabel="Shop pre-loved"
      products={products}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyMessage="No pre-loved finds right now. Check back soon."
    >
      {(items) => <ProductGrid products={items} />}
    </ProductSection>
  );
}
