import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * The app's one sticky mobile action bar.
 *
 * Three features need the same thing — a full-width bar pinned to the bottom of a
 * phone, inside the safe-area inset — and each one hand-rolled it. That is how
 * they drifted: one of them sat at the *floating* z-index, the same layer as the
 * bottom-right rail, so the cart, go-to-top and assistant buttons landed on top of
 * an opaque bar and the stacking was decided by whichever mounted last.
 *
 * This component is where that is settled, once:
 *
 *  - **Position.** `.mobile-action-bar` owns the corner, the safe-area inset and
 *    the `--layer-mobile-bar` rung, which is deliberately *below* `--layer-floating`
 *    so the rail always wins a tie.
 *  - **Clearance.** A bar this size covers the bottom of the viewport, so the
 *    rail would still sit on top of it even at a lower z-index. While a bar is
 *    mounted it publishes its measured height to `--mobile-action-bar-height`, and
 *    `.floating-rail` adds that to its own bottom offset — so the rail rides *above*
 *    the bar instead of being hidden behind it, with no pixel value anyone has to
 *    keep in sync by hand.
 *  - **Motion.** One enter/exit and one reduced-motion check for all three callers.
 */
export function MobileActionBar({
  visible,
  children,
}: {
  /** Bars slide in only once their inline counterpart has scrolled away. */
  visible: boolean;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const barRef = useRef<HTMLDivElement>(null);

  // Publishing is keyed on `visible` rather than run forever: the rail only needs
  // to know while a bar is actually on screen, and leaving the variable set after
  // an exit would keep the rail permanently lifted.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.removeProperty("--mobile-action-bar-height");
      return;
    }

    const bar = barRef.current;
    if (!bar) return;
    const publish = () =>
      root.style.setProperty("--mobile-action-bar-height", `${Math.ceil(bar.offsetHeight)}px`);
    publish();

    // The bar grows when a label wraps or a button appears, and that has to move
    // the rail with it.
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--mobile-action-bar-height");
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={barRef}
          initial={reduceMotion ? false : { y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { y: 90, opacity: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="mobile-action-bar lg:hidden"
        >
          <div className="border-t border-white/60 bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl dark:border-white/5">
            <div className="mx-auto flex max-w-3xl items-center gap-3">{children}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
