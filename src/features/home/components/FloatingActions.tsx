import { Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Package, Plus, ShoppingCart } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useCartCount } from "@/lib/query/cart";
import { useCartDrawer } from "@/lib/cart/drawer";

function DockLink({
  to,
  label,
  children,
}: {
  to: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.94 }} transition={{ duration: 0.18 }}>
      <Link
        to={to}
        aria-label={label}
        title={label}
        className="soft-button relative flex size-12 items-center justify-center rounded-full text-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {children}
      </Link>
    </motion.div>
  );
}

/**
 * Floating utility dock — high-value actions only.
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

  return (
    <motion.nav
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.3, ease: "easeOut" }}
      aria-label="Quick actions"
      className="floating-dock fixed bottom-5 right-5 z-40 flex flex-col items-center gap-2.5 rounded-full p-2.5 sm:bottom-7 sm:right-7"
    >
      <motion.button
        type="button"
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.18 }}
        onClick={openCart}
        aria-label={
          cartCount > 0 ? `Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}` : "Cart, empty"
        }
        title="Cart"
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

      <DockLink to="/browse" label="Browse listings">
        <Package size={18} />
      </DockLink>

      <motion.button
        type="button"
        whileHover={{ y: -3 }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: 0.18 }}
        onClick={() => navigate({ to: user ? "/list" : "/login" })}
        aria-label={user ? "Sell an item" : "Sign in to sell an item"}
        title={user ? "Sell an item" : "Sign in to sell"}
        className="primary-button flex size-12 items-center justify-center rounded-full text-primary-foreground"
      >
        <Plus size={20} />
      </motion.button>
    </motion.nav>
  );
}
