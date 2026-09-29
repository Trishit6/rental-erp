import { Link } from "@tanstack/react-router";
import { Bike, Camera, ChevronRight, Gamepad2, Heart, Sofa, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Category } from "@/lib/types";

const categoryIcons: Record<string, LucideIcon> = {
  Furniture: Sofa,
  Electronics: Camera,
  Fashion: Heart,
  Tools: Wrench,
  Vehicles: Bike,
  Gaming: Gamepad2,
};

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
        <Link to="/browse" className="nav-link hidden items-center gap-1 text-sm font-bold sm:flex">
          All categories <ChevronRight size={15} />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {(categories ?? []).slice(0, 10).map((category) => (
          <Link
            key={category.id}
            to="/browse"
            search={{ category: category.slug }}
            className="raised-surface flex min-w-[118px] flex-col items-center gap-3 rounded-2xl px-4 py-4 transition hover:-translate-y-1 hover:text-primary"
          >
            <span className="inset-surface flex size-11 items-center justify-center rounded-full">
              {(() => {
                const Icon = categoryIcons[category.name] ?? Sofa;
                return <Icon size={19} />;
              })()}
            </span>
            <span className="text-xs font-bold">{category.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
