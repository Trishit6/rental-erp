import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { CartHeader } from "./CartHeader";
import { CartItemList } from "./CartItemList";
import { CartSummary } from "./CartSummary";
import { CartActions } from "./CartActions";
import { CartEmptyState } from "./CartEmptyState";
import { CartErrorState } from "./CartErrorState";
import { CartMobileSummary } from "./CartMobileSummary";
import { ClearCartDialog } from "./ClearCartDialog";
import { activeItems } from "./schema";
import type { CartItem, CartTotals, UpdateCartItemInput } from "../types";

/**
 * The cart page.
 *
 * Composition only: every rule lives in `./components/schema` and every request
 * in `./query`. This file owns just two pieces of view state — whether the
 * clear-cart dialog is open, and whether the sticky mobile summary should be
 * showing.
 *
 * Desktop is two columns (lines + summary). On mobile the summary becomes a
 * sticky bar once the real one scrolls past, so checkout is always reachable
 * without scrolling back up. The page reserves matching bottom padding so the bar
 * never covers the last line's controls.
 */
export function CartPage({
  items,
  totals,
  isLoading,
  isFetching,
  isError,
  isGuest,
  onRetry,
  onUpdate,
  onRemove,
  onSave,
  onClear,
  pendingItemId,
  removingItemId,
  isClearing,
}: {
  items: CartItem[];
  totals: CartTotals;
  isLoading: boolean;
  isFetching?: boolean;
  isError?: boolean;
  /** Signed out: the cart is server-persisted, so there is nothing to show. */
  isGuest?: boolean;
  onRetry: () => void;
  onUpdate: (itemId: number, patch: UpdateCartItemInput) => void;
  onRemove: (itemId: number) => void;
  onSave: (itemId: number, savedForLater: boolean) => void;
  onClear: () => void;
  /** The line a write is in flight for, so only it dims. */
  pendingItemId?: number | null;
  removingItemId?: number | null;
  isClearing?: boolean;
}) {
  const [clearOpen, setClearOpen] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const active = activeItems(items);

  // Hide the sticky bar while the real summary is still on screen, so the two
  // are never visible at once. A ref rather than a document query, so the
  // observer always points at this page's own summary.
  useEffect(() => {
    const summary = summaryRef.current;
    if (!summary) return;

    const observer = new IntersectionObserver(
      ([entry]) => setSummaryVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(summary);
    return () => observer.disconnect();
  }, [items.length]);

  if (isGuest) {
    return (
      <div className="page-wrap space-y-6 py-10 pt-8">
        <CartHeader totals={totals} />
        <CartEmptyState />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-wrap py-12">
        <CartErrorState onRetry={onRetry} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 pt-8">
        <div className="page-wrap">
          <CartHeader totals={totals} isLoading />
          <div className="mt-6">
            <CartItemList
              items={[]}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onSave={onSave}
              isLoading
            />
          </div>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="page-wrap space-y-6 py-10 pt-8">
        <CartHeader totals={totals} />
        <CartEmptyState />
      </div>
    );
  }

  return (
    <div className="page-wrap space-y-6 pb-32 pt-8 lg:pb-12">
      <CartHeader totals={totals} />

      <p className="text-xs text-muted-foreground">
        Prices and availability are checked again before checkout.
      </p>

      <div
        className={`grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] transition-opacity duration-200 ${
          isFetching ? "opacity-70" : ""
        }`}
        aria-busy={isFetching}
      >
        <CartItemList
          items={items}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onSave={onSave}
          pendingItemId={pendingItemId}
          removingItemId={removingItemId}
        />

        <div ref={summaryRef} className="space-y-4" data-cart-summary>
          <CartSummary items={active} totals={totals} showBreakdown />

          <CartActions items={active} />

          {items.length > 1 && (
            <button
              type="button"
              onClick={() => setClearOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-muted-foreground transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Trash2 size={13} aria-hidden />
              Clear cart
            </button>
          )}
        </div>
      </div>

      <CartMobileSummary
        items={active}
        totals={totals}
        visible={summaryVisible && active.length > 0}
      />

      <ClearCartDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        itemCount={items.length}
        isClearing={isClearing}
        onConfirm={() => {
          setClearOpen(false);
          onClear();
        }}
      />
    </div>
  );
}
