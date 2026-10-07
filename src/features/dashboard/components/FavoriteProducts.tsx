import { Link } from "@tanstack/react-router";
import { ArrowRight, Heart, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductCard } from "@/components/shared/product-card";
import { useDashboardFavorites } from "../query";
import { SectionError } from "./RecentOrders";

/**
 * A compact grid of the most recently saved favourites — one request for the
 * whole section, never one per product. The heart on each card is the shared
 * `FavoriteButton`, so un-saving here updates the same store the wishlist page
 * reads.
 */
export function FavoriteProducts() {
  const { data, isPending, isError, refetch } = useDashboardFavorites();
  const products = data?.items ?? [];

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-extrabold">
          <Heart size={16} aria-hidden className="text-primary" />
          Saved for later
        </h2>
        {products.length > 0 && (
          <Link to="/favorites" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            View all favorites
            <ArrowRight size={12} aria-hidden />
          </Link>
        )}
      </div>

      {isPending ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4" aria-hidden>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </div>
      ) : isError ? (
        <SectionError label="Favorites failed to load" onRetry={() => void refetch()} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No favorites yet"
          description="Save products you love and they'll show up here."
          action={
            <Link
              to="/browse"
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-foreground hover:text-primary"
            >
              <Search size={13} aria-hidden />
              Start exploring Revaro
            </Link>
          }
        />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </Card>
  );
}