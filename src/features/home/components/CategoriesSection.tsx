import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/features/categories/components/CategoryIcon";
import type { Category } from "@/lib/types";
import { categoryAccent } from "./schema";

/**
 * The category button rail.
 *
 * Every tile is a real button (keyboard reachable, aria-labelled) that
 * navigates to its category, with a per-slug accent tint from the Revaro
 * palette so the row does not read as nine identical tiles. Glyphs come from
 * the shared whitelist resolver, so an unknown icon string can only ever fall
 * back to the generic mark.
 */
export function CategoriesSection({ categories }: { categories?: Category[] }) {
  return (
    <section className="space-y-5" aria-labelledby="categories-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Find your next favourite</p>
          <h2 id="categories-heading" className="section-title mt-1">
            Browse by category
          </h2>
        </div>
        <Link to="/categories" className="nav-link hidden items-center gap-1 text-sm font-bold sm:flex">
          All categories <ChevronRight size={15} />
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3" role="group" aria-label="Shop by category">
        {(categories ?? []).slice(0, 10).map((category, index) => {
          const accent = categoryAccent(category.slug);
          return (
            <motion.div
              key={category.id}
              whileHover={{ y: -4 }}
              // Capped stagger: the rail settles in quickly instead of the last
              // tile waiting half a second for its turn.
              transition={{
                duration: 0.18,
                ease: "easeOut",
                delay: Math.min(index, 6) * 0.03,
              }}
            >
              <Link
                to="/browse"
                search={{ category: category.slug }}
                aria-label={`Explore ${category.name}`}
                className="raised-surface flex min-w-[118px] flex-col items-center gap-3 rounded-2xl px-4 py-4 transition-colors hover:text-foreground"
              >
                <span
                  className="flex size-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: accent.tint, color: accent.text }}
                >
                  <CategoryIcon icon={category.icon} name={category.name} size={19} />
                </span>
                <span className="text-xs font-bold">{category.name}</span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
