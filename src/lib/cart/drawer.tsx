import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Cart drawer open state.
 *
 * This lives in `lib/` rather than in the cart feature because four unrelated
 * places open the drawer — the navbar, the floating dock, a product page's
 * add-to-cart, and the cart page itself — and features must never import each
 * other. Shared UI state is exactly what `lib/` is for.
 *
 * It holds only *whether* the drawer is open. The cart itself is server state
 * and lives in `lib/query/cart`.
 */

type CartDrawerContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  setOpen: (open: boolean) => void;
};

const CartDrawerContext = createContext<CartDrawerContextValue | null>(null);

export function CartDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close, setOpen }), [close, isOpen, open]);

  return <CartDrawerContext.Provider value={value}>{children}</CartDrawerContext.Provider>;
}

export function useCartDrawer(): CartDrawerContextValue {
  const context = useContext(CartDrawerContext);
  if (!context) throw new Error("useCartDrawer must be used within CartDrawerProvider");
  return context;
}
