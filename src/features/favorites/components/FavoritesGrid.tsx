import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { productGridClassName } from "@/components/shared/product-grid";
import { FavoriteProductCard } from "./FavoriteProductCard";
import { FavoritesSkeleton } from "./FavoritesSkeleton";
import { FavoritesEmptyState } from "./FavoritesEmptyState";
import type { FavoriteProduct } from "../types";

/**
 * The wishlist grid.
 *
 * Cards are wrapped in `AnimatePresence` so a removal fades the card out in
 * place instead of the page re-flowing abruptly, and `layout` lets the
 * remaining cards slide up into the gap.
 */
export function FavoritesGrid({
  products,
  isLoading,
  isFiltered,
  onRemoved,
  onPrefetch,
  onClearFilters,
  onClearSearch,
}: {
  products: FavoriteProduct[];
  isLoading?: boolean;
  /** True when the current view is narrowed by a search term or a filter. */
  isFiltered?: boolean;
  onRemoved?: (info: { productId: number; slug?: string; title: string }) => void;
  onPrefetch?: (slug: string) => void;
  onClearFilters?: () => void;
  onClearSearch?: () => void;
}) {
  const reduceMotion = useReducedMotion();

  if (isLoading) return <FavoritesSkeleton count={8} />;

  if (!products.length) {
    // Nothing saved at all is a different message from "nothing matched".
    return (
      <FavoritesEmptyState
        isFiltered={isFiltered}
        onClearFilters={onClearFilters}
        onClearSearch={onClearSearch}
      />
    );
  }

  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={productGridClassName}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {products.map((product) => (
          <FavoriteProductCard
            key={product.id}
            product={product}
            onRemoved={onRemoved}
            onPrefetch={onPrefetch}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
