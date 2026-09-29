import type { ReactNode, RefObject } from "react";
import { Pagination } from "@/components/shared/pagination";
import { ProductCard } from "@/components/shared/product-card";
import { productGridClassName } from "@/components/shared/product-grid";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import type { CategoryProduct, ListingMode } from "../types";

/**
 * Category product results.
 *
 * Reuses the single shared `ProductCard` and the shared grid rhythm and
 * `Pagination` — there is deliberately no category-local card. Filtering, sorting
 * and pagination are all server-side (this component only renders what the query
 * returned), and counts always come from the response's pagination envelope.
 *
 * A background refetch dims the current results instead of replacing them with
 * skeletons, so navigating filters never flashes the layout away.
 */
export function CategoryProducts({
  products,
  isLoading,
  isRefreshing,
  isError,
  mode,
  page,
  totalPages,
  onPageChange,
  onPrefetchProduct,
  onPrefetchPage,
  emptyState,
  errorState,
  resultsRef,
}: {
  products: CategoryProduct[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  isError?: boolean;
  mode?: ListingMode;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPrefetchProduct?: (slug: string) => void;
  onPrefetchPage?: (page: number) => void;
  emptyState: ReactNode;
  errorState: ReactNode;
  resultsRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={resultsRef} className="scroll-mt-24 space-y-5">
      {isError ? (
        errorState
      ) : (
        <>
          <div
            className={cn("transition-opacity duration-200", isRefreshing && "opacity-60")}
            aria-busy={isRefreshing}
          >
            {isLoading ? (
              <ProductGridSkeleton count={8} />
            ) : products.length ? (
              <div className={productGridClassName}>
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    mode={mode}
                    onPrefetch={
                      onPrefetchProduct ? () => onPrefetchProduct(product.slug) : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              emptyState
            )}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPrefetch={onPrefetchPage}
          />
        </>
      )}
    </div>
  );
}
