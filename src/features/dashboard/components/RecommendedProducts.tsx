import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductCard } from "@/components/shared/product-card";
import { useRecommendedProducts } from "../query";
import { SectionError } from "./RecentOrders";

/**
 * A small taste of the catalogue's recommended ordering — exactly the products
 * the server returns for `sort=recommended` (the same ordering Home's featured
 * row uses), rendered with the shared `ProductCard`, so nothing here is a
 * bespoke card or a client-side guess at a ranking.
 */
export function RecommendedProducts() {
  const { data, isPending, isError, refetch } = useRecommendedProducts();
  const products = data ?? [];

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-extrabold">
          <Sparkles size={16} aria-hidden className="text-primary" />
          Recommended for you
        </h2>
        <Link to="/browse" className="text-xs font-bold text-primary hover:underline">
          Browse all
        </Link>
      </div>

      {isPending ? (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4" aria-hidden>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </div>
      ) : isError ? (
        <SectionError label="Recommendations failed to load" onRetry={() => void refetch()} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing to recommend yet"
          description="When the catalogue has products, the best of them will appear here."
          action={
            <Link
              to="/browse"
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-foreground hover:text-primary"
            >
              Browse products
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
        />
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </Card>
  );
}