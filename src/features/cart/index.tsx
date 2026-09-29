import { useCallback } from "react";
import { toast } from "sonner";
import {
  cartErrorMessage,
  useCartQuery,
  useClearCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from "@/lib/query/cart";
import { CartPage as CartPageView } from "./components/CartPage";
import { CartDrawer } from "./components/CartDrawer";
import type { UpdateCartItemInput } from "./types";

/**
 * The cart page.
 *
 * This is the wiring layer: the shared cart query and mutations come from
 * `lib/query/cart` (the same ones the navbar, the drawer and Product Details
 * use), and the page itself is presentational. Nothing here talks to the network
 * directly and no cart state is duplicated.
 *
 * All three surfaces read one cache entry, so a quantity changed here is already
 * correct in the drawer the next time it opens — no refetch, no disagreement.
 */
export function CartPage() {
  const { cart, items, isPending, isFetching, isError, isGuest, refetch } = useCartQuery();

  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const clearCart = useClearCart();

  /**
   * A quantity, duration, mode or save-for-later change. Each is a server-backed
   * cart update — the line's mode and window decide its price and how it merges,
   * so guessing locally and syncing later would show a number that is not real.
   */
  const handleUpdate = useCallback(
    (itemId: number, patch: UpdateCartItemInput) => {
      updateItem.mutate(
        { itemId, patch },
        { onError: (error) => toast.error(cartErrorMessage(error)) },
      );
    },
    [updateItem],
  );

  const handleRemove = useCallback(
    (itemId: number) => {
      removeItem.mutate(itemId, {
        onSuccess: () => toast("Removed from cart"),
        onError: (error) => toast.error(cartErrorMessage(error)),
      });
    },
    [removeItem],
  );

  const handleSave = useCallback(
    (itemId: number, savedForLater: boolean) => {
      updateItem.mutate(
        { itemId, patch: { savedForLater } },
        {
          onSuccess: () => toast(savedForLater ? "Saved for later" : "Moved to cart"),
          onError: (error) => toast.error(cartErrorMessage(error)),
        },
      );
    },
    [updateItem],
  );

  const handleClear = useCallback(() => {
    clearCart.mutate(undefined, {
      onSuccess: (cleared) => toast.success(`Cleared ${cleared} items`),
      onError: (error) => toast.error(cartErrorMessage(error)),
    });
  }, [clearCart]);

  return (
    <CartPageView
      items={items}
      totals={cart.totals}
      isLoading={isPending}
      isFetching={isFetching}
      isError={isError}
      isGuest={isGuest}
      onRetry={refetch}
      onUpdate={handleUpdate}
      onRemove={handleRemove}
      onSave={handleSave}
      onClear={handleClear}
      pendingItemId={updateItem.isPending ? (updateItem.variables?.itemId ?? null) : null}
      removingItemId={removeItem.isPending ? (removeItem.variables ?? null) : null}
      isClearing={clearCart.isPending}
    />
  );
}

/**
 * The global drawer, mounted once in the root layout.
 *
 * It reads the same cart entry as the page and the badge, so it needs no props
 * and no second request — and because it lives above the routes, adding an item
 * on any page can open it without that page knowing how.
 */
export function CartDrawerHost() {
  const { cart, isPending, isError } = useCartQuery();
  return <CartDrawer cart={cart} isLoading={isPending} isError={isError} />;
}

export { CartDrawerProvider } from "@/lib/cart/drawer";
