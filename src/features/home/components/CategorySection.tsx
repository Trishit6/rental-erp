import type { LucideIcon } from "lucide-react";
import { Bike, Camera, Gamepad2, Heart, Sofa, Wrench } from "lucide-react";
import type { Category } from "@/lib/types";
import { CategoryCard } from "./CategoryCard";

/** Icon mapping by category name; unknown categories get a generic glyph. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Furniture: Sofa,
  Electronics: Camera,
  Cameras: Camera,
  Fashion: Heart,
  Tools: Wrench,
  Vehicles: Bike,
  Gaming: Gamepad2,
};

/**
 * Browse-by-category rail. Data comes from the categories API — never
 * hardcoded in the UI (spec §18).
 */
export function CategorySection({ categories }: { categories?: Category[] }) {
  if (!categories?.length) return null;

  return (
    <section className="space-y-5" aria-labelledby="categories-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Find your next favourite</p>
          <h2 id="categories-heading" className="section-title mt-1">
            Browse by category
          </h2>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {categories.slice(0, 10).map((category) => (
          <CategoryCard
            key={category.id}
            slug={category.slug}
            name={category.name}
            icon={CATEGORY_ICONS[category.name]}
          />
        ))}
      </div>
    </section>
  );
}
