import { motion, useReducedMotion } from "framer-motion";
import { ProductGrid } from "@/components/shared/product-grid";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { useRelatedProducts } from "../query";

/**
 * Same-category recommendations. Rendered only when the request succeeds and
 * returns something — a failure here must never break the product page.
 * Cached for 10 minutes, so revisiting a product does not re-request them.
 */
export function RelatedProducts({
  productIdOrSlug,
  categoryName,
}: {
  productIdOrSlug: string;
  categoryName: string;
}) {
  const reduceMotion = useReducedMotion();
  const { data, isLoading, isError } = useRelatedProducts(productIdOrSlug);

  if (isError) return null;

  if (isLoading) {
    return (
      <section aria-label="Related products" className="space-y-4">
        <h2 className="font-heading text-lg font-extrabold">More like this</h2>
        <ProductGridSkeleton count={4} />
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <motion.section
      aria-label="Related products"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-4"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-lg font-extrabold">More like this</h2>
        <p className="text-xs font-semibold text-muted-foreground">in {categoryName}</p>
      </div>
      <ProductGrid products={data} />
    </motion.section>
  );
}
