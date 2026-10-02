import { Loader2 } from "lucide-react";
import { ProductImage } from "@/components/shared/product-image";
import type { CategoryDetail } from "../types";
import { CategoryIcon } from "./CategoryIcon";

/**
 * Category detail header: image (or the category's icon when it has no photo),
 * name, description and the counts the API returned. It deliberately mirrors the
 * Browse header so the two pages read as one application.
 */
export function CategoryHeader({
  category,
  total,
  isLoading,
}: {
  category: CategoryDetail;
  /** Result count from the products response — the same number Browse shows. */
  total?: number;
  isLoading?: boolean;
}) {
  const productLabel =
    total === 1 ? "1 product" : `${(total ?? 0).toLocaleString("en-IN")} products`;

  return (
    <header className="raised-surface overflow-hidden rounded-3xl">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="inset-surface shrink-0 rounded-2xl p-2">
          <ProductImage
            src={category.imageUrl}
            alt=""
            className="size-24 rounded-xl sm:size-28"
            fallback={
              <span className="flex size-24 items-center justify-center rounded-xl text-primary sm:size-28">
                <CategoryIcon icon={category.icon} name={category.name} size={34} />
              </span>
            }
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="eyebrow">Category</p>
          <h1 className="section-title mt-1 text-3xl sm:text-4xl">{category.name}</h1>
          {category.description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {category.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold">
            <span aria-live="polite" className="flex items-center gap-1.5">
              {isLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin text-primary" aria-hidden />
                  Finding good things…
                </>
              ) : (
                productLabel
              )}
            </span>
            {category.subcategoryCount > 0 && (
              <span className="text-muted-foreground">
                {category.subcategoryCount}{" "}
                {category.subcategoryCount === 1 ? "subcategory" : "subcategories"}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
