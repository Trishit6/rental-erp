import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import { CategoryFilter } from "@/components/shared/product-filters/CategoryFilter";
import { MobileFilterSheet } from "@/components/shared/product-filters/MobileFilterSheet";
import { FloatingSlotContent } from "@/lib/floating/rail";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/utils/use-media-query";
import { categoryActiveFilterCount, CLEARED_CATEGORY_FILTERS } from "./schema";
import type { CategorySearch, Subcategory } from "../types";

/**
 * Mobile filtering for a category page.
 *
 * Self-contained: it owns the sheet's open state and renders its own floating
 * trigger, so the page composes one element instead of threading state through.
 * The sheet itself is the shared one (same groups, same visual language as Browse)
 * with the category-specific "Subcategory" group plugged in.
 *
 * The draft lives inside the sheet, so nothing is requested while the visitor is
 * still choosing; Apply commits once, and closing without applying discards the
 * draft rather than applying it silently.
 */
export function MobileCategorySheet({
  search,
  onChange,
  subcategories,
  isLoadingSubcategories,
}: {
  search: CategorySearch;
  onChange: (patch: Partial<CategorySearch>) => void;
  subcategories: Subcategory[];
  isLoadingSubcategories?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const activeCount = categoryActiveFilterCount(search);
  const hasSubcategories = subcategories.length > 0 || isLoadingSubcategories;

  // The trigger is mobile-only. On desktop it is `lg:hidden`, which would leave
  // an invisible control still reserving a rail slot and pushing the cart, the
  // sell button and the assistant down the column.
  const isMobileOnly = !useMediaQuery(DESKTOP_QUERY);

  return (
    <>
      <FloatingSlotContent slot="filters" active={isMobileOnly}>
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Filters${activeCount > 0 ? `, ${activeCount} active` : ""}`}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={reduceMotion ? undefined : { y: -2 }}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="floating-dock flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-foreground lg:hidden"
        >
          <SlidersHorizontal size={16} aria-hidden className="text-primary" />
          Filters
          {activeCount > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </motion.button>
      </FloatingSlotContent>

      <MobileFilterSheet
        open={open}
        onOpenChange={setOpen}
        search={search}
        activeCount={categoryActiveFilterCount}
        leadGroup={
          hasSubcategories
            ? ({ search: draft, onChange: patch }) => (
                <CategoryFilter
                  title="Subcategory"
                  categories={subcategories}
                  isLoading={isLoadingSubcategories}
                  value={draft.subcategory}
                  onChange={(subcategory) => patch({ subcategory })}
                />
              )
            : undefined
        }
        onApply={(next) => {
          setOpen(false);
          onChange({ ...CLEARED_CATEGORY_FILTERS, ...next });
        }}
      />
    </>
  );
}
