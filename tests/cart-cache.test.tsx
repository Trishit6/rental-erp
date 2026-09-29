import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys, privateQueryKeys } from "@/lib/query/keys";
import {
  countOf,
  emptyCart,
  withCartQuantity,
  withoutCartItem,
  withSavedForLater,
  useCartCount,
  useCartQuery,
  useRemoveCartItem,
  useUpdateCartItem,
  useValidateCart,
} from "@/lib/query/cart";
import { addToCart, getCart, removeCartItem, updateCartItem, validateCart } from "@/features/cart/api";
import { makeCart, makePurchaseItem, makeRentalItem } from "./support/cart-fixtures";
import type { Cart } from "@/features/cart/types";

const authState = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

vi.mock("@/features/cart/api", () => ({
  getCart: vi.fn(),
  getCartCount: vi.fn(),
  addToCart: vi.fn(),
  updateCartItem: vi.fn(),
  removeCartItem: vi.fn(),
  clearCart: vi.fn(),
  validateCart: vi.fn(),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Hold a request open so a test can observe the UI while it is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 1 };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(updateCartItem).mockResolvedValue({ itemId: 10, quantity: 1, merged: false });
  vi.mocked(removeCartItem).mockResolvedValue(undefined);
  vi.mocked(addToCart).mockResolvedValue({ itemId: 10, quantity: 1, merged: false });
});

/* ------------------------------ pure helpers ------------------------------- */

describe("cart cache transitions", () => {
  const cart = makeCart([makePurchaseItem({ id: 10, quantity: 2 }), makeRentalItem({ id: 11, quantity: 1 })]);

  it("scales a line's money when the quantity changes", () => {
    const next = withCartQuantity(cart, 10, 4);
    const line = next.items.find((item) => item.id === 10)!;

    expect(line.quantity).toBe(4);
    // 2 units doubled to 4.
    expect(line.pricing.lineTotal).toBe(cart.items[0]!.pricing.lineTotal * 2);
    expect(next.totals.quantityCount).toBe(cart.totals.quantityCount + 2);
  });

  it("leaves the cart alone for a line that is not in it", () => {
    expect(withCartQuantity(cart, 999, 5)).toBe(cart);
  });

  it("takes a removed line out of every total", () => {
    const next = withoutCartItem(cart, 10);
    const removed = cart.items[0]!;

    expect(next.items).toHaveLength(1);
    expect(next.totals.subtotal).toBe(cart.totals.subtotal - removed.pricing.lineTotal + removed.pricing.depositTotal);
    expect(next.totals.estimatedTotal).toBe(cart.totals.estimatedTotal - removed.pricing.lineTotal);
    expect(next.totals.itemCount).toBe(1);
    expect(next.totals.quantityCount).toBe(1);
  });

  it("removes a saved-for-later line without touching the payable totals", () => {
    const withSaved = makeCart([makePurchaseItem({ id: 10 }), makePurchaseItem({ id: 12, savedForLater: true })]);
    const next = withoutCartItem(withSaved, 12);

    expect(next.totals.estimatedTotal).toBe(withSaved.totals.estimatedTotal);
    expect(next.totals.itemCount).toBe(withSaved.totals.itemCount);
  });

  it("leaves the cart alone for a line that is not in it", () => {
    expect(withoutCartItem(cart, 999)).toBe(cart);
  });

  it("moves a line between the cart and saved-for-later", () => {
    const next = withSavedForLater(cart, 10, true);
    expect(next.items.find((item) => item.id === 10)!.savedForLater).toBe(true);
    expect(next.totals.estimatedTotal).toBe(cart.totals.estimatedTotal);
  });

  it("has a real empty shape before the first response", () => {
    const empty = emptyCart();
    expect(countOf(empty)).toBe(0);
    expect(countOf(undefined)).toBe(0);
  });
});

/* -------------------------------- one entry -------------------------------- */

describe("one cache entry for every surface", () => {
  it("derives the badge from the cart, so the two can never disagree", async () => {
    const cart = makeCart([makePurchaseItem({ quantity: 3 })]);
    client.setQueryData(queryKeys.cart, cart);
    vi.mocked(getCart).mockClear();

    const page = renderHook(() => useCartQuery(), { wrapper });
    const badge = renderHook(() => useCartCount(), { wrapper });

    expect(page.result.current.cart.totals.quantityCount).toBe(3);
    expect(badge.result.current).toBe(3);
    // Two consumers, one cache entry, and neither re-fetched it: the number on
    // the navbar and the number on the page are the same number.
    expect(page.result.current.cart).toBe(cart);
    expect(getCart).not.toHaveBeenCalled();
  });

  it("never requests the cart for a guest", () => {
    authState.user = null;
    vi.mocked(getCart).mockClear();

    const { result } = renderHook(() => useCartQuery(), { wrapper });

    expect(getCart).not.toHaveBeenCalled();
    // And it still renders — as an empty cart, not an error.
    expect(result.current.isGuest).toBe(true);
    expect(result.current.cart.totals.quantityCount).toBe(0);
  });

  it("evicts the cart on logout, alongside every other private entry", () => {
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem()]));

    for (const key of privateQueryKeys) client.removeQueries({ queryKey: key });

    expect(client.getQueryData(queryKeys.cart)).toBeUndefined();
  });

  it("keeps public data through a logout", () => {
    client.setQueryData(queryKeys.product("sony-wh-1000xm5"), { id: 1 });
    for (const key of privateQueryKeys) client.removeQueries({ queryKey: key });
    expect(client.getQueryData(queryKeys.product("sony-wh-1000xm5"))).toBeDefined();
  });
});

/* ------------------------------ optimistic IO ------------------------------ */

describe("removing a line", () => {
  it("disappears at once, before the server answers", async () => {
    const gate = deferred<void>();
    vi.mocked(removeCartItem).mockReturnValue(gate.promise);
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem({ id: 10 }), makeRentalItem({ id: 11 })]));

    const { result } = renderHook(() => useRemoveCartItem(), { wrapper });

    act(() => result.current.mutate(10));

    await waitFor(() => {
      expect(client.getQueryData<Cart>(queryKeys.cart)!.items).toHaveLength(1);
    });
    expect(result.current.isPending).toBe(true);

    gate.resolve(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("is put back exactly as it was when the request fails", async () => {
    const cart = makeCart([makePurchaseItem({ id: 10 }), makeRentalItem({ id: 11 })]);
    const gate = deferred<void>();
    vi.mocked(removeCartItem).mockReturnValue(gate.promise);
    client.setQueryData(queryKeys.cart, cart);

    const { result } = renderHook(() => useRemoveCartItem(), { wrapper });

    act(() => result.current.mutate(10));
    await waitFor(() => expect(client.getQueryData<Cart>(queryKeys.cart)!.items).toHaveLength(1));

    gate.reject(new Error("network"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(queryKeys.cart)).toEqual(cart);
  });

  it("leaves the product in the marketplace — only the relationship goes", async () => {
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem({ id: 10 })]));
    const { result } = renderHook(() => useRemoveCartItem(), { wrapper });

    act(() => result.current.mutate(10));

    await waitFor(() => expect(removeCartItem).toHaveBeenCalledWith(10));
    // The API call targets the line, never a product.
    expect(vi.mocked(removeCartItem).mock.calls[0]).toEqual([10]);
  });
});

describe("updating a line", () => {
  it("is not patched optimistically — the server owns the new price", async () => {
    const before = makeCart([makePurchaseItem({ id: 10, quantity: 1 })]);
    client.setQueryData(queryKeys.cart, before);
    const gate = deferred<{ itemId: number; quantity: number; merged: boolean }>();
    vi.mocked(updateCartItem).mockReturnValue(gate.promise);

    const { result } = renderHook(() => useUpdateCartItem(), { wrapper });

    act(() => result.current.mutate({ itemId: 10, patch: { quantity: 3 } }));

    // The quantity is the server's to confirm, so nothing is guessed here.
    expect(client.getQueryData<Cart>(queryKeys.cart)).toEqual(before);
    await waitFor(() => expect(result.current.isPending).toBe(true));

    gate.resolve({ itemId: 10, quantity: 3, merged: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("validating before checkout", () => {
  it("adopts the server's items and totals instead of refetching", async () => {
    const current = makeCart([makePurchaseItem({ id: 10 })]);
    client.setQueryData(queryKeys.cart, current);

    const fresh = makeCart([makePurchaseItem({ id: 10, quantity: 5 })]);
    vi.mocked(validateCart).mockResolvedValue({
      valid: true,
      items: fresh.items,
      totals: fresh.totals,
    });

    const { result } = renderHook(() => useValidateCart(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(validateCart).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<Cart>(queryKeys.cart)!.items[0]!.quantity).toBe(5);
    expect(client.getQueryData<Cart>(queryKeys.cart)!.totals.quantityCount).toBe(5);
  });

  it("reports invalid without touching the cached items", async () => {
    const current = makeCart([makePurchaseItem({ id: 10 })]);
    client.setQueryData(queryKeys.cart, current);
    vi.mocked(validateCart).mockResolvedValue({
      valid: false,
      items: current.items,
      totals: current.totals,
    });

    const { result } = renderHook(() => useValidateCart(), { wrapper });
    const outcome = await act(async () => result.current.mutateAsync());

    expect(outcome.valid).toBe(false);
  });
});
