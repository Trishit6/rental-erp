import { motion, useReducedMotion } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import { useCartCount } from "@/lib/query/cart";
import { cn } from "@/lib/utils/cn";
import { useCartDrawer } from "@/lib/cart/drawer";

/**
 * The cart trigger for the navbar and the floating dock.
 *
 * Opens the drawer rather than navigating, so adding an item and checking the
 * cart never costs the page you were on. The badge is the shared cart count, so
 * it updates the moment anything is added — from Product Details, the wishlist,
 * or the cart page itself.
 *
 * The badge animates *only when the number changes*: keying it on `count` remounts
 * it, which replays the pop. Reduced-motion users get the number without the
 * movement.
 */
export function CartDrawerTrigger({
  variant = "icon",
  className,
  label = "Cart",
}: {
  variant?: "icon" | "labelled";
  className?: string;
  label?: string;
}) {
  const { open } = useCartDrawer();
  const count = useCartCount();
  const reduceMotion = useReducedMotion();

  const accessibilityLabel =
    count > 0 ? `${label}, ${count} ${count === 1 ? "item" : "items"}` : `${label}, empty`;

  return (
    <button
      type="button"
      onClick={open}
      aria-label={accessibilityLabel}
      data-testid="cart-drawer-trigger"
      className={cn(
        "soft-button relative inline-flex items-center justify-center gap-2 rounded-full text-foreground transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        variant === "labelled" ? "h-11 px-4 text-sm font-bold" : "size-10",
        className,
      )}
    >
      <ShoppingCart size={18} aria-hidden />
      {variant === "labelled" && <span>{label}</span>}

      <motion.span
        key={count}
        initial={reduceMotion || count === 0 ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
        aria-hidden
        className={cn(
          "absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground",
          count === 0 && "hidden",
        )}
      >
        {count}
      </motion.span>
    </button>
  );
}
