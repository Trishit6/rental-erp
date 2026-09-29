import { Loader2 } from "lucide-react";

/** Browse heading. The product count always comes from the API response. */
export function BrowseHeader({
  total,
  isLoading,
  categoryName,
}: {
  total?: number;
  isLoading?: boolean;
  categoryName?: string;
}) {
  return (
    <header>
      <p className="eyebrow">Explore products</p>
      <h1 className="section-title mt-1 text-3xl sm:text-4xl">
        {categoryName ? categoryName : "Browse"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Find something to rent, buy, or make yours.
      </p>
      <p className="mt-3 flex items-center gap-1.5 text-sm font-bold" aria-live="polite">
        {isLoading ? (
          <>
            <Loader2 size={13} className="animate-spin text-primary" aria-hidden />
            Finding good things…
          </>
        ) : (
          `${total ?? 0} ${total === 1 ? "product" : "products"}`
        )}
      </p>
    </header>
  );
}
