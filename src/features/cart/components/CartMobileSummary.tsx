import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { formatInr } from "@/lib/pricing";
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
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduceMotion ? false : { y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { y: 90, opacity: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="fixed inset-x-0 bottom-0 z-[var(--layer-floating)] lg:hidden"
        >
          <div className="border-t border-white/60 bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl dark:border-white/5">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Estimated total</p>
                <p className="font-heading text-xl font-black tabular-nums">
                  {formatInr(totals.estimatedTotal)}
                </p>
              </div>

              <div className="w-48 shrink-0">
                <CartActions
                  items={items}
                  label="Checkout"
                  onValidated={undefined}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
