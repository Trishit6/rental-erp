import { Link } from "@tanstack/react-router";
import { useReducedMotion, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategorySummary } from "../types";
import { CategoryIcon } from "./CategoryIcon";

/**
 * Curated category rail. The selection is the backend's `isFeatured` flag
 * (`GET /api/categories?featured=true`) — never a list hardcoded in the UI, so
 * curating it is a data change and the client can't drift from the catalogue.
 *
 * Horizontal scroll on small screens, a row of equal cards from `sm` up.
 */
export function FeaturedCategories({
  categories,
  isLoading,
  onPrefetch,
}: {
  categories: CategorySummary[];
  isLoading?: boolean;
  onPrefetch?: (slug: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  if (!isLoading && !categories.length) return null;

  return (
    <section className="space-y-4" aria-labelledby="featured-categories-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Handpicked</p>
          <h2 id="featured-categories-heading" className="section-title mt-1">
            Featured categories
          </h2>
        </div>
        <Link
          to="/categories"
          className="nav-link inline-flex shrink-0 items-center gap-1 text-sm font-semibold"
        >
          All categories
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[92px] w-[190px] shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
          {categories.map((category) => (
            <motion.div
              key={category.id}
              whileHover={reduceMotion ? undefined : { y: -3 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-[210px] shrink-0 sm:w-auto"
            >
              <Link
                to="/categories/$categorySlug"
                params={{ categorySlug: category.slug }}
                onMouseEnter={() => onPrefetch?.(category.slug)}
                onFocus={() => onPrefetch?.(category.slug)}
                className="raised-surface group flex h-full items-center gap-3 rounded-2xl p-3.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <span className="inset-surface flex size-11 shrink-0 items-center justify-center rounded-2xl text-primary">
                  <CategoryIcon icon={category.icon} name={category.name} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-sm font-extrabold">
                    {category.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground">
                    {category.productCount > 0
                      ? `${category.productCount} ${category.productCount === 1 ? "product" : "products"}`
                      : "Explore"}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="text-primary transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  <ArrowRight size={15} />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
