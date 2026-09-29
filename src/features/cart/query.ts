import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import { CART_GC_MS, CART_STALE_MS, useCartQuery } from "@/lib/query/cart";
import type { Cart } from "./types";

/**
 * Cart query options.
 *
 * Thin by design: the cart's cache entry and every mutation already live in
 * `lib/query/cart`, because six different surfaces need them and a feature-local
 * copy is how two of them end up disagreeing. This module is the feature's view
 * of that one implementation — it re-exports it rather than re-wrapping it, so
 * there is still exactly one cart system in the app.
 *
 * Components should import hooks from `@/lib/query/cart` directly; these
 * re-exports exist so the feature reads as a self-contained module.
 */

export {
  CART_GC_MS,
  CART_STALE_MS,
  useAddToCart,
  useCartCount,
  useCartCountQuery,
  useCartQuery,
  useClearCart,
  useRemoveCartItem,
  useUpdateCartItem,
  useValidateCart,
} from "@/lib/query/cart";

/**
 * Warm the cart on intent. The page, drawer and badge all read the same entry,
 * so this makes every one of them instant rather than only the surface that
 * happened to trigger it.
 */
export function usePrefetchCart(): () => void {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useCallback(() => {
    if (!user) return;
    void queryClient.prefetchQuery({
      queryKey: queryKeys.cart,
      staleTime: CART_STALE_MS,
      gcTime: CART_GC_MS,
    });
  }, [queryClient, user]);
}

/** The cart as a plain object, for components that only render it. */
export function useCart(): Cart {
  return useCartQuery().cart;
}

/** Exposed so a test can assert against the one shared key. */
export const cartKey = queryKeys.cart;
