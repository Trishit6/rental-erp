import { Link } from "@tanstack/react-router";
import { ArrowRight, PackageSearch, RefreshCw } from "lucide-react";
import type { ProductCardData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ProductGridSkeleton } from "@/components/ui/skeleton";

/**
 * Generic product section used by Featured / Rental / Pre-loved on Home.
 * Handles its own loading, empty and error states so one failed section
 * never crashes the page (spec §35).
 */
export function ProductSection({
  id,
  eyebrow,
  title,
  subtitle,
  linkTo = "/browse",
  linkLabel = "View all",
  linkSearch,
  products,
  isLoading,
  isError,
  onRetry,
  emptyMessage = "Nothing here right now. Check back soon.",
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  linkTo?: string;
  linkLabel?: string;
  linkSearch?: Record<string, string>;
  products: ProductCardData[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  children: (items: ProductCardData[]) => React.ReactNode;
}) {
  return (
    <section className="space-y-5" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={`${id}-heading`} className="section-title mt-1">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Button asChild variant="secondary">
          <Link to={linkTo} search={linkSearch}>
            {linkLabel}
            <ArrowRight size={15} />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <ProductGridSkeleton />
      ) : isError ? (
        <div className="inset-surface flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center">
          <p className="text-sm font-semibold">This section couldn't load.</p>
          {onRetry && (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw size={14} /> Try again
            </Button>
          )}
        </div>
      ) : products.length === 0 ? (
        <div className="inset-surface flex items-center justify-center gap-2.5 rounded-3xl px-6 py-10 text-sm text-muted-foreground">
          <PackageSearch size={17} className="text-primary/60" />
          {emptyMessage}
        </div>
      ) : (
        children(products)
      )}
    </section>
  );
}
