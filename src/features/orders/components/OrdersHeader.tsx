import { Package } from "lucide-react";

/**
 * The page heading.
 *
 * `role="banner"` is deliberately not used — the site header already owns that
 * landmark. This is a plain section heading, and the page's `h1` comes from it.
 */
export function OrdersHeader({ resultCount }: { resultCount?: number }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow flex items-center gap-1.5">
          <Package size={12} aria-hidden="true" />
          Your activity
        </p>
        <h1 className="section-title mt-1 text-3xl">My Orders</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Track and manage everything you've purchased or rented on Revaro.
        </p>
      </div>

      {resultCount !== undefined && (
        <p
          className="inset-surface rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          aria-live="polite"
        >
          {/* One string, not three adjacent nodes: split text reads as separate
              words to a screen reader and to text matching. */}
          {resultCount === 1 ? "1 order" : `${resultCount} orders`}
        </p>
      )}
    </header>
  );
}
