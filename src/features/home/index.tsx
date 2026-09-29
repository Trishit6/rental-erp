import { CategorySection } from "./components/CategorySection";
import { FeaturedProducts } from "./components/FeaturedProducts";
import { FloatingActions } from "./components/FloatingActions";
import { HeroSection } from "./components/HeroSection";
import { HomeSkeleton } from "./components/HomeSkeleton";
import { HowItWorks } from "./components/HowItWorks";
import { PreLovedSection } from "./components/PreLovedSection";
import { RentToOwnSection } from "./components/RentToOwnSection";
import { RentalSection } from "./components/RentalSection";
import { SellerCTA } from "./components/SellerCTA";
import {
  useFeaturedProducts,
  useHomeCategories,
  useMarketplaceStats,
  usePreLovedProducts,
  useRentalProducts,
} from "./query";

/**
 * Home composition only (spec §46) — each section owns its data, loading,
 * empty and error states so one failure never breaks the page.
 */
export function HomePage() {
  const stats = useMarketplaceStats();
  const categories = useHomeCategories();
  const featured = useFeaturedProducts();
  const rentals = useRentalProducts();
  const preLoved = usePreLovedProducts();

  const anyLoading =
    stats.isLoading ||
    categories.isLoading ||
    featured.isLoading ||
    rentals.isLoading ||
    preLoved.isLoading;

  if (anyLoading) {
    return <HomeSkeleton />;
  }

  return (
    <div className="page-wrap space-y-9 pb-2 pt-7 sm:pt-10">
      <HeroSection stats={stats.data} />

      <CategorySection categories={categories.data} />

      <FeaturedProducts
        products={featured.data ?? []}
        isLoading={featured.isLoading}
        isError={featured.isError}
        onRetry={() => void featured.refetch()}
      />

      <RentalSection
        products={rentals.data ?? []}
        isLoading={rentals.isLoading}
        isError={rentals.isError}
        onRetry={() => void rentals.refetch()}
      />

      <RentToOwnSection />

      <PreLovedSection
        products={preLoved.data ?? []}
        isLoading={preLoved.isLoading}
        isError={preLoved.isError}
        onRetry={() => void preLoved.refetch()}
      />

      <HowItWorks />

      <SellerCTA />

      <FloatingActions />
    </div>
  );
}
