import { motion, useReducedMotion } from "framer-motion";
import { Heart } from "lucide-react";
import { favoritesSubtitle } from "./schema";

/**
 * Page heading. The count is whatever the API said — `undefined` while it is
 * still loading, so the line never flashes a wrong number or a hardcoded one.
 */
export function FavoritesHeader({
  total,
  isLoading = false,
  showing,
}: {
  /** True total saved, from the API. `undefined` until it arrives. */
  total?: number;
  isLoading?: boolean;
  /** How many of them the current filters match, once known. */
  showing?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.header
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-wrap items-end justify-between gap-4"
    >
      <div>
        <p className="eyebrow flex items-center gap-1.5">
          <Heart size={13} aria-hidden className="text-primary" />
          Saved items
        </p>
        <h1 className="section-title mt-1 text-3xl">Your favorites</h1>
        <p className="mt-1.5 text-sm text-muted-foreground" data-testid="favorites-subtitle">
          {favoritesSubtitle(total, isLoading)}
        </p>
      </div>

      {showing !== undefined && total !== undefined && showing < total && (
        <p className="text-xs font-semibold text-muted-foreground">
          Showing {showing} of {total}
        </p>
      )}
    </motion.header>
  );
}
