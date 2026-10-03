import { formatInr } from "@/lib/pricing";
import { MobileActionBar } from "@/lib/floating/mobile-action-bar";
import { CartActions } from "./CartActions";
import type { CartItem, CartTotals } from "../types";

/**
 * The sticky mobile summary.
 *
 * Only shown below `lg`, where the page's summary column has scrolled away. It
 * sits inside the safe-area inset so it clears the iOS home indicator, and the
 * page reserves matching bottom padding so it never covers the last cart item or
 * its controls.
 */
export function CartMobileSummary({
  items,
  totals,
  visible,
}: {
  items: CartItem[];
  totals: CartTotals;
  /** Hidden while the summary is still on screen, to avoid two of them at once. */
  visible: boolean;
}) {
  return (
    <MobileActionBar visible={visible}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted-foreground">Estimated total</p>
        <p className="font-heading text-xl font-black tabular-nums">
          {formatInr(totals.estimatedTotal)}
        </p>
      </div>

      <div className="w-48 shrink-0">
        <CartActions items={items} label="Checkout" onValidated={undefined} />
      </div>
    </MobileActionBar>
  );
}
