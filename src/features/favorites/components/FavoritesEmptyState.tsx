import { motion, useReducedMotion } from "framer-motion";
import { Heart, PackageSearch } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * The wishlist's two empty states.
 *
 * "Nothing saved" and "nothing matched" are different problems, so they get
 * different copy and different actions: the first offers exploring, the second
 * offers widening what is already there.
 */
export function FavoritesEmptyState({
  isFiltered,
  onClearFilters,
  onClearSearch,
}: {
  isFiltered?: boolean;
  onClearFilters?: () => void;
  onClearSearch?: () => void;
}) {
  const reduceMotion = useReducedMotion();

  if (isFiltered) {
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <EmptyState
          icon={PackageSearch}
          title="No saved items match"
          description="Nothing in your favorites matches this search or these filters. Try widening them."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
              <Button variant="secondary" size="sm" onClick={onClearSearch}>
                Clear search
              </Button>
            </div>
          }
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      <EmptyState
        icon={Heart}
        title="Your favorites are empty"
        description="Save products you're interested in and they'll appear here — on every device you sign in on."
        action={
          <Button asChild>
            <Link to="/browse">Explore products</Link>
          </Button>
        }
      />
    </motion.div>
  );
}
