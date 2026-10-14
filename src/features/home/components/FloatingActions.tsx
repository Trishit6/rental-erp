import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import { useCartCount } from "@/lib/query/cart";
import { useCartDrawer } from "@/lib/cart/drawer";
import { FloatingSlotContent } from "@/lib/floating/rail";
import { Tooltip } from "@/components/ui/tooltip";

/** The dock only appears once the page has scrolled this far. */
const REVEAL_AFTER = 400;

/**
 * The home page's single floating action.
 *
 * It used to claim three rail slots — cart, browse and sell — so a package icon
 * and a plus button stacked on top of the cart and the global go-to-top. The
 * brief is one primary action: the cart. Browse and sell are already in the
 * navbar and the hero, so the dock is now a single control that fades in after
 * the first screen rather than a lit cluster over the content.
 *
 * The cart opens the shared drawer rather than navigating, and its badge is the
 * shared cart count — the same number the navbar and the cart page read from one
 * cache entry, so the three can never disagree.
 */
export function FloatingActions() {
  const cartCount = useCartCount();
  const { open: openCart } = useCartDrawer();
  const reduceMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    function onScroll() {
      setRevealed(window.scrollY > REVEAL_AFTER);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <FloatingSlotContent slot="cart" active={revealed}>
      {revealed && (
        <Tooltip label="Open cart" side="left">
          <motion.button
            type="button"
            onClick={openCart}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            whileTap={{ scale: 0.96 }}
            aria-label={
              cartCount > 0
                ? `Open cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`
                : "Open cart"
            }
            className="soft-button relative flex size-12 items-center justify-center rounded-full text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ShoppingCart size={18} aria-hidden />
            {cartCount > 0 && (
              <motion.span
                key={cartCount}
                initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                aria-hidden
                className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
              >
                {cartCount}
              </motion.span>
            )}
          </motion.button>
        </Tooltip>
      )}
    </FloatingSlotContent>
  );
}
