import { api } from "@/lib/api/client";
import { updateCartItemSchema } from "./components/schema";
import type {
  AddCartItemInput,
  Cart,
  CartCount,
  CartMutationResult,
  CartValidationResult,
  UpdateCartItemInput,
} from "./types";

/**
 * Every network call the cart makes. Components never touch this file directly —
 * they use the hooks in `lib/query/cart`, which is shared by the navbar, the
 * drawer, the cart page, Product Details and every product card.
 *
 * `userId` is never part of a payload: the server derives the owner from the
 * session cookie, so a client cannot address another cart even if it tries.
 *
 * Nothing here sends a price, subtotal, total or deposit. The server always
 * recomputes those from the product row, so the client's arithmetic is display
 * only and can never be the thing that gets charged.
 */

export async function getCart(): Promise<Cart> {
  return (await api.get<Cart>("/cart")).data;
}

/** Badge / dock count. Sum of quantities, not of rows. */
export async function getCartCount(): Promise<number> {
  return (await api.get<CartCount>("/cart/count")).data.count;
}

export async function addToCart(input: AddCartItemInput): Promise<CartMutationResult> {
  return (await api.post<CartMutationResult>("/cart/items", input)).data;
}

export async function updateCartItem(
  itemId: number,
  input: UpdateCartItemInput,
): Promise<CartMutationResult> {
  // Parsed client-side first so an obviously invalid patch never leaves the
  // browser. The server validates again and stays the authority.
  return (
    await api.patch<CartMutationResult>(`/cart/items/${itemId}`, updateCartItemSchema.parse(input))
  ).data;
}

export async function removeCartItem(itemId: number): Promise<void> {
  await api.delete(`/cart/items/${itemId}`);
}

export async function clearCart(): Promise<number> {
  return (await api.delete<{ cleared: number }>("/cart")).data.cleared;
}

/**
 * Re-check every line against the products as they are *now*. The page calls
 * this before handing over to checkout, so a line that went stale since it was
 * added is caught here rather than at order time.
 */
export async function validateCart(): Promise<CartValidationResult> {
  return (await api.get<CartValidationResult>("/cart/validate")).data;
}
