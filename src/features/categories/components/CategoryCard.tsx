import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { CategorySummary } from "../types";
import { CategoryIcon } from "./CategoryIcon";

/**
 * Category tile — the one card used by `/categories`, the featured rail and the
 * subcategory list. Hover raises the card and nudges the arrow; the image scales a
 * touch. Every movement is skipped when the visitor prefers reduced motion.
 *
 * The whole card is a real link (not a div with an onClick), so middle-click,
 * keyboard activation and "open in new tab" all behave the way a link should.
 */
export function CategoryCard({
  category,
  onPrefetch,
  variant = "default",
}: {
  category: CategorySummary;
  onPrefetch?: (slug: string) => void;
  /** `tile` is the compact subcategory treatment; `default` is the full card. */
  variant?: "default" | "tile";
}) {
  const reduceMotion = useReducedMotion();
  const { slug, name, description, imageUrl, productCount } = category;

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -4 }}
      whileTap={reduceMotion ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={variant === "tile" ? "" : "h-full"}
    >
      <Link
        to="/categories/$categorySlug"
        params={{ categorySlug: slug }}
        onMouseEnter={() => onPrefetch?.(slug)}
        onFocus={() => onPrefetch?.(slug)}
        className={cn(
          "raised-surface group flex h-full flex-col overflow-hidden rounded-2xl transition",
          "hover:shadow-[10px_10px_26px_var(--shadow-color-dark),-10px_-10px_26px_var(--shadow-color-light)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          variant === "tile" ? "gap-2 px-4 py-4" : "gap-3",
        )}
      >
        {variant === "tile" ? (
          <span className="inset-surface flex size-10 shrink-0 items-center justify-center rounded-full text-primary">
            <CategoryIcon icon={category.icon} name={name} size={18} />
          </span>
        ) : (
          <span className="inset-surface relative block overflow-hidden rounded-[18px] p-2">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-[16/10] w-full rounded-[14px] object-cover transition duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <span className="flex aspect-[16/10] w-full items-center justify-center rounded-[14px] bg-[var(--inset-bg)] text-primary">
                <CategoryIcon icon={category.icon} name={name} size={30} />
              </span>
            )}
          </span>
        )}

        <span className={cn("flex flex-1 flex-col", variant === "tile" ? "" : "px-4 pb-4")}>
          <span className="flex items-center gap-2">
            <span className="font-heading text-sm font-extrabold leading-tight">{name}</span>
            {variant === "tile" && productCount > 0 && (
              <span className="text-[11px] font-semibold text-muted-foreground">
                {productCount}
              </span>
            )}
          </span>

          {variant === "default" && description && (
            <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
          )}

          {variant === "default" && (
            <>
              <span className="neumo-divider my-3" />
              <span className="flex items-center justify-between gap-2">
                {/* Counts are only ever the numbers the API sent — never estimated. */}
                {productCount > 0 ? (
                  <span className="text-[11px] font-bold text-muted-foreground">
                    {productCount} {productCount === 1 ? "product" : "products"}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-muted-foreground">Explore</span>
                )}
                <span
                  aria-hidden
                  className="flex size-7 items-center justify-center rounded-full text-primary transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  <ArrowRight size={15} />
                </span>
              </span>
            </>
          )}
        </span>
      </Link>
    </motion.div>
  );
}
