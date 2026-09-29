import { ProductGrid } from "@/components/shared/product-grid";
import type { ProductCardData } from "@/lib/types";
import { ProductSection } from "./ProductSection";

/** Rental highlight section — real rent-capable products (spec §23). */
export function RentalSection({
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
      id="rentals"
      eyebrow="By the day, week or month"
      title="Try it before you own it."
      subtitle="Rent something for a weekend, a week, or longer."
      linkTo="/browse"
      linkSearch={{ mode: "rent" }}
      linkLabel="All rentals"
      products={products}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      emptyMessage="No rental products available right now. Check back soon."
    >
      {(items) => <ProductGrid products={items} />}
    </ProductSection>
  );
}
