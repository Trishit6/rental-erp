import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Package, Plus, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCartCount } from "@/lib/query/cart";
import { useCartDrawer } from "@/lib/cart/drawer";
import { FloatingSlotContent } from "@/lib/floating/rail";
import { Tooltip } from "@/components/ui/tooltip";

/** Shared hover/tap response, so every control in the rail reacts identically. */
const buttonMotion = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.94 },
  transition: { duration: 0.18 },
};

/**
 * Floating utility dock — high-value actions only.
 *
 * These are three slots in the shared floating rail rather than a pill of their
 * own. The dock used to be `fixed bottom-5 right-5` — the same corner, at the
 * same offset, as the assistant launcher — so on the home page the two sat on
 * top of each other. Claiming slots means the rail decides where the cart, the
 * browse link and the sell action sit relative to each other and to the
 * assistant, and no three of them have to agree on a pixel value.
 *
 * The cart button opens the shared drawer rather than navigating, and its badge
 * is the shared cart count: the same number the navbar and the cart page show,
 * derived from one cache entry, so the three can never disagree.
 */
export function FloatingActions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cartCount = useCartCount();
  const { open: openCart } = useCartDrawer();
  const reduceMotion = useReducedMotion();

  const cart = (
    <Tooltip label="Open cart" side="left">
      <motion.button
        type="button"
        {...buttonMotion}
        onClick={openCart}
        aria-label={
          cartCount > 0
            ? `Open cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`
            : "Open cart"
        }
        className="soft-button relative flex size-12 items-center justify-center rounded-full text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ShoppingCart size={18} aria-hidden />
        <AnimatePresence>
          {cartCount > 0 && (
            <motion.span
              key={cartCount}
              initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduceMotion ? undefined : { scale: 0.4, opacity: 0 }}
              aria-hidden
              className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
            >
              {cartCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </Tooltip>
  );

  const browse = (
    <Tooltip label="Browse listings" side="left">
      <motion.div {...buttonMotion}>
        <Link
          to="/browse"
          aria-label="Browse listings"
          className="soft-button flex size-12 items-center justify-center rounded-full text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Package size={18} aria-hidden />
        </Link>
      </motion.div>
    </Tooltip>
  );

  const sellLabel = user ? "Sell an item" : "Sign in to sell an item";
  const sell = (
    <Tooltip label={sellLabel} side="left">
      <motion.button
        type="button"
        {...buttonMotion}
        onClick={() => navigate({ to: user ? "/list" : "/login" })}
        aria-label={sellLabel}
        className="primary-button flex size-12 items-center justify-center rounded-full text-primary-foreground"
      >
        <Plus size={20} aria-hidden />
      </motion.button>
    </Tooltip>
  );

  return (
    <>
      <FloatingSlotContent slot="cart">{cart}</FloatingSlotContent>
      <FloatingSlotContent slot="browse">{browse}</FloatingSlotContent>
      <FloatingSlotContent slot="sell">{sell}</FloatingSlotContent>
    </>
  );
}
