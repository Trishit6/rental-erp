import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/auth-context";
import { queryKeys } from "./keys";
import {
  addToCart,
  clearCart as clearCartRequest,
  getCart,
  getCartCount,
  removeCartItem,
  updateCartItem,
  validateCart,
} from "@/features/cart/api";
import { clampCartQuantity } from "@/features/cart/components/schema";
import type {
  AddCartItemInput,
  Cart,
  CartItem,
  CartMutationResult,
  CartValidationResult,
  UpdateCartItemInput,
} from "@/features/cart/types";

/**
 * THE cart system.
 *
 * One cache entry, `queryKeys.cart`, holds the whole `Cart` — items *and* the
 * server-computed totals. Everything that shows cart state reads this entry:
 * the navbar badge, the floating dock, the drawer, the cart page and the wishlist
 * card. That is what makes them impossible to disagree, and why a quantity change
 * on the cart page is already correct in the drawer when it is next opened.
 *
 * The badge is *derived* from this entry rather than fetched separately: a second
 * endpoint for "how many" would be a second number that can drift from the one
 * the page is showing.
 */

/** Fresh for 30s: short enough to notice a change made elsewhere, long enough that
 *  walking between pages does not re-request the cart on every navigation. */
export const CART_STALE_MS = 30_000;
export const CART_GC_MS = 10 * 60_000;

/* ------------------------------ pure helpers ------------------------------- */
/* Exported so the cache transitions are unit-testable without a QueryClient. */

/** The cart with one line's quantity changed, totals recomputed to match. */
export function withCartQuantity(cart: Cart, itemId: number, quantity: number): Cart {
  const line = cart.items.find((item) => item.id === itemId);
  if (!line) return cart;

  // A quantity change is a server-priced operation, so the client only adjusts
  // the *display* proportionally. The server's numbers replace these the moment
  // the request settles — the optimistic figure is never what gets charged.
  const factor = quantity / line.quantity;
  const scale = (value: number) => Math.round(value * factor);

  return {
    ...cart,
    items: cart.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            quantity,
            pricing: {
              ...item.pricing,
              lineTotal: scale(item.pricing.lineTotal),
              rentalCharge: scale(item.pricing.rentalCharge),
              depositTotal: scale(item.pricing.depositTotal),
            },
          }
        : item,
    ),
    totals: {
      ...cart.totals,
      quantityCount: cart.totals.quantityCount - line.quantity + quantity,
    },
  };
}

/** The cart with one line removed and its contribution taken out of the totals. */
export function withoutCartItem(cart: Cart, itemId: number): Cart {
  const line = cart.items.find((item) => item.id === itemId);
  if (!line) return cart;

  const items = cart.items.filter((item) => item.id !== itemId);
  const wasActive = !line.savedForLater;

  return {
    ...cart,
    items,
    totals: {
      ...cart.totals,
      subtotal:
        cart.totals.subtotal - (wasActive ? line.pricing.lineTotal - line.pricing.depositTotal : 0),
      rentalCharges: cart.totals.rentalCharges - (wasActive ? line.pricing.rentalCharge : 0),
      securityDeposits: cart.totals.securityDeposits - (wasActive ? line.pricing.depositTotal : 0),
      estimatedTotal: cart.totals.estimatedTotal - (wasActive ? line.pricing.lineTotal : 0),
      itemCount: wasActive ? Math.max(0, cart.totals.itemCount - 1) : cart.totals.itemCount,
      quantityCount: wasActive
        ? Math.max(0, cart.totals.quantityCount - line.quantity)
        : cart.totals.quantityCount,
    },
  };
}

/** The cart with a line moved between the cart and "saved for later". */
export function withSavedForLater(cart: Cart, itemId: number, savedForLater: boolean): Cart {
  return {
    ...cart,
    items: cart.items.map((item) => (item.id === itemId ? { ...item, savedForLater } : item)),
  };
}

/** An empty cart, so the UI has a real shape before the first response. */
export function emptyCart(): Cart {
  return {
    id: 0,
    items: [],
    totals: {
      subtotal: 0,
      rentalCharges: 0,
      securityDeposits: 0,
      estimatedTotal: 0,
      itemCount: 0,
      quantityCount: 0,
    },
  };
}

/* --------------------------------- queries --------------------------------- */

export function cartQueryOptions(enabled: boolean) {
  return {
    queryKey: queryKeys.cart,
    queryFn: getCart,
    /** Guests never fire this. */
    enabled,
    staleTime: CART_STALE_MS,
    gcTime: CART_GC_MS,
    retry: 1,
    // The cart is the one thing that is worth re-syncing the moment the user
    // comes back to the tab or the network returns.
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  };
}

/**
 * The cart. Holds cached data through a background refetch rather than flashing
 * a skeleton, which is what lets the drawer open instantly and stay correct.
 */
export function useCartQuery(): {
  cart: Cart;
  items: CartItem[];
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  isGuest: boolean;
  refetch: () => void;
} {
  const { user } = useAuth();
  const { data, isPending, isFetching, isError, refetch } = useQuery(cartQueryOptions(!!user));

  const cart = data ?? emptyCart();
  return {
    cart,
    items: cart.items,
    isPending: isPending && !!user,
    isFetching,
    isError,
    isGuest: !user,
    refetch: () => void refetch(),
  };
}

/**
 * The badge number: total quantities, derived from the shared cart entry.
 * There is deliberately no second request — a separate count endpoint would be
 * a second number that can drift from the one the page is showing.
 */
export function useCartCount(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    ...cartQueryOptions(!!user),
    select: (cart: Cart) => cart.totals.quantityCount,
  });
  return data ?? 0;
}

/**
 * The standalone count endpoint, for a caller that genuinely needs the number
 * without the cart. Note this is a *separate* cache entry from `queryKeys.cart`
 * — it is not what the badge uses, because that would be a second number that
 * could disagree with the page. Do not wire the badge here.
 */
export function useCartCountQuery() {
  const { user } = useAuth();
  return useQuery<number>({
    queryKey: [...queryKeys.cart, "count"],
    queryFn: getCartCount,
    enabled: !!user,
    staleTime: CART_STALE_MS,
  });
}

/* -------------------------------- mutations -------------------------------- */

/** Every write ends here: pull the authoritative cart back into the cache. */
function useRefreshCart() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cart });
  }, [queryClient]);
}

/**
 * Add a line. The cart is *not* patched optimistically: a new line needs product
 * data and server pricing that only the response can supply, and guessing would
 * risk showing a price the user never agreed to. The refetch is one request.
 */
export function useAddToCart(): UseMutationResult<CartMutationResult, Error, AddCartItemInput> {
  const refresh = useRefreshCart();
  return useMutation({
    mutationFn: (input: AddCartItemInput) => addToCart(input),
    onSuccess: refresh,
  });
}

/** Change a line: quantity, mode, rental window, or saved-for-later. */
export function useUpdateCartItem(): UseMutationResult<
  CartMutationResult,
  Error,
  { itemId: number; patch: UpdateCartItemInput }
> {
  const refresh = useRefreshCart();
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: number; patch: UpdateCartItemInput }) =>
      updateCartItem(itemId, patch),
    onSuccess: refresh,
  });
}

/**
 * Remove a line, optimistically. Safe to roll back: the previous cart is
 * snapshotted and restored verbatim on failure, and the removed line is still
 * in the user's cart, not deleted from the marketplace.
 */
export function useRemoveCartItem(): UseMutationResult<void, Error, number> {
  const queryClient = useQueryClient();
  const refresh = useRefreshCart();

  return useMutation<void, Error, number, { previous: Cart | undefined }>({
    mutationFn: (itemId: number) => removeCartItem(itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.cart });
      const previous = queryClient.getQueryData<Cart>(queryKeys.cart);
      if (previous) {
        queryClient.setQueryData<Cart>(queryKeys.cart, withoutCartItem(previous, itemId));
      }
      return { previous };
    },
    onError: (_error, _itemId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.cart, context.previous);
      } else {
        queryClient.removeQueries({ queryKey: queryKeys.cart });
      }
    },
    onSettled: refresh,
  });
}

/** Empty the cart. Confirmed by the caller before it reaches here. */
export function useClearCart(): UseMutationResult<number, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clearCartRequest(),
    onSuccess: () => {
      queryClient.setQueryData<Cart>(queryKeys.cart, (previous) =>
        previous ? { ...previous, items: [], totals: emptyCart().totals } : previous,
      );
    },
  });
}

/**
 * Re-check the cart against the products as they are now. The page calls this
 * before checkout and only navigates when it comes back clean, so a stale line
 * is caught here rather than becoming an order nobody expected.
 */
export function useValidateCart(): UseMutationResult<CartValidationResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => validateCart(),
    onSuccess: (result) => {
      // The validation response carries the current items and totals, so adopt
      // it rather than issuing another request.
      queryClient.setQueryData<Cart>(queryKeys.cart, (previous) =>
        previous ? { ...previous, items: result.items, totals: result.totals } : previous,
      );
    },
  });
}

/* --------------------------------- helpers --------------------------------- */

/** Clamp a quantity against the line's own stock before it is sent. */
export function nextQuantity(item: CartItem, delta: number): number {
  return clampCartQuantity(item.quantity + delta, item.product?.availableQuantity ?? 1);
}

/** A user-actionable message from any thrown cart error. */
export function cartErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "UNAUTHENTICATED":
        return "Please sign in to update your cart.";
      case "INSUFFICIENT_QUANTITY":
        return "Not enough units of that item are available.";
      case "DATE_RANGE_UNAVAILABLE":
        return "Those dates are no longer available.";
      case "MIN_DAYS":
      case "MAX_DAYS":
        return error.message;
      default:
        return error.message || "Couldn't update your cart. Try again.";
    }
  }
  return "Couldn't reach us. Check your connection and try again.";
}

/** Drop the cart from the cache — used when the session goes away. */
export function clearCartCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: queryKeys.cart });
}

/** The badge count a raw cart would show, without a cache. Useful in tests. */
export function countOf(cart: Cart | undefined): number {
  return cart?.totals.quantityCount ?? 0;
}

/* ------------------------------ shared exports ----------------------------- */

/**
 * Types and the raw "empty the cart" call, re-exported so other features can
 * consume the cart without importing the cart feature itself (features must
 * never import each other). Checkout is the main consumer: it reads the cart and
 * clears it once the order exists.
 */
export type {
  Cart,
  CartItem,
  CartListingType,
  CartTotals,
  CartValidation,
  PurchaseCartItem,
  RentalCartItem,
} from "@/features/cart/types";
export { clearCart as clearCartRequest } from "@/features/cart/api";
