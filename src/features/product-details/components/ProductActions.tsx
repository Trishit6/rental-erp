import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { maxQuantityFor, productActions } from "./schema";
import type { ListingMode, ProductAction, ProductDetails } from "../types";

function QuantitySelector({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="inset-surface flex items-center gap-1 rounded-full p-1">
        <button
          type="button"
          aria-label="Decrease quantity"
          disabled={value <= 1}
          onClick={() => onChange(value - 1)}
          className="flex size-8 items-center justify-center rounded-full transition hover:bg-primary/10 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Minus size={14} aria-hidden />
        </button>
        <span
          aria-live="polite"
          className="min-w-8 text-center font-heading text-sm font-extrabold tabular-nums"
        >
          {value}
        </span>
        <button
          type="button"
          aria-label="Increase quantity"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex size-8 items-center justify-center rounded-full transition hover:bg-primary/10 disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {max <= 2 ? (
          <span className="font-bold text-primary">Only {max} left</span>
        ) : (
          <>{max} available</>
        )}
      </p>
    </div>
  );
}

/**
 * Actions for the selected mode. Labels come from `productActions`, which maps
 * `RENT_AND_BUY` to a purchase-into-cart plus an immediate rental — so a button
 * never claims an action the product can't do.
 */
export function ProductActions({
  product,
  mode,
  available,
  quantity,
  onQuantityChange,
  onAction,
  pendingActionId,
}: {
  product: ProductDetails;
  mode: ListingMode;
  available: boolean;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onAction: (action: ProductAction) => void;
  pendingActionId: string | null;
}) {
  const max = maxQuantityFor(product.availableQuantity);
  const actions = productActions(mode, available);

  if (!available) {
    return (
      <div className="inset-surface rounded-3xl p-4">
        <p className="text-sm font-bold">Currently unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This listing can't be ordered right now. Save it and check back, or browse similar items.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {max > 1 && <QuantitySelector value={quantity} max={max} onChange={onQuantityChange} />}

      <div className="flex flex-wrap gap-3">
        {actions.map((action) => {
          const pending = pendingActionId === action.id;
          return (
            <Button
              key={action.id}
              size="lg"
              variant={action.tone === "primary" ? "default" : "secondary"}
              disabled={pendingActionId !== null && !pending}
              aria-busy={pending}
              onClick={() => onAction(action)}
              className={cn(action.tone === "primary" && "min-w-44")}
            >
              {action.tone === "primary" && <ShoppingBag size={16} aria-hidden />}
              {pending ? "Adding…" : action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
