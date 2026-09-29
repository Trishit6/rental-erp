import { formatInr } from "@/lib/pricing";
import { cn } from "@/lib/utils/cn";
import { modeLabel, unitPriceLabel } from "./schema";
import type { CartItem } from "../types";

/**
 * A line-by-line price breakdown.
 *
 * Shown on the cart page and at the top of the drawer so the totals below it are
 * never a number the user has to take on trust. A deposit is called out as its
 * own line and is never folded into a rental charge.
 */
export function CartPriceBreakdown({
  items,
  className,
}: {
  items: CartItem[];
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <dl className={cn("space-y-2.5", className)} aria-label="Price breakdown">
      {items.map((item) => {
        const title = item.product?.title ?? "Unavailable item";
        const deposit = item.pricing.depositTotal;

        return (
          <div key={item.id} className="space-y-1 border-b border-[var(--divider)] pb-2.5 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="min-w-0 flex-1 truncate text-foreground">
                {title}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {modeLabel(item.mode)}
                  {item.mode === "RENT" && ` · ${item.rentalDuration}d`}
                  {item.quantity > 1 && ` · ×${item.quantity}`}
                </span>
              </dt>
              <dd className="shrink-0 font-bold tabular-nums">{formatInr(item.pricing.lineTotal)}</dd>
            </div>

            <p className="text-[11px] font-medium text-muted-foreground">
              {unitPriceLabel(item)}
              {item.quantity > 1 && ` × ${item.quantity}`}
            </p>

            {deposit > 0 && (
              <p className="text-[11px] font-semibold text-accent">
                Includes {formatInr(deposit)} refundable security deposit
              </p>
            )}
          </div>
        );
      })}
    </dl>
  );
}
