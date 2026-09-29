import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import {
  addToCart,
  clearCart,
  getCart,
  getCartCount,
  removeCartItem,
  updateCartItem,
  validateCart,
} from "@/features/cart/api";
import { makeCart, makePurchaseItem, makeRentalItem } from "./support/cart-fixtures";

vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.patch).mockReset();
  vi.mocked(api.delete).mockReset();
});

describe("reading the cart", () => {
  it("reads the whole cart, not a bare list of lines", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: makeCart([makePurchaseItem()]) } as never);

    const cart = await getCart();

    expect(api.get).toHaveBeenCalledWith("/cart");
    expect(cart.items).toHaveLength(1);
    expect(cart.totals.estimatedTotal).toBe(2_990_000);
  });

  it("reads the badge count from its own endpoint", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { count: 3 } } as never);

    await expect(getCartCount()).resolves.toBe(3);
    expect(api.get).toHaveBeenCalledWith("/cart/count");
  });

  it("re-checks the cart against the products as they are now", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { valid: false, items: [], totals: makeCart().totals },
    } as never);

    const result = await validateCart();

    expect(api.get).toHaveBeenCalledWith("/cart/validate");
    expect(result.valid).toBe(false);
  });
});

describe("writing the cart", () => {
  it("sends the mode, quantity and window an add needs", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { itemId: 1, quantity: 1, merged: false },
    } as never);

    await addToCart({
      productId: 7,
      mode: "RENT",
      quantity: 2,
      startDate: "2026-03-01T00:00:00.000Z",
      endDate: "2026-03-08T00:00:00.000Z",
    });

    expect(api.post).toHaveBeenCalledWith("/cart/items", {
      productId: 7,
      mode: "RENT",
      quantity: 2,
      startDate: "2026-03-01T00:00:00.000Z",
      endDate: "2026-03-08T00:00:00.000Z",
    });
  });

  /* The client never proposes a price. If it did, the server would ignore it —
     and a future implementation might not, so the field must never be sent. */
  it("never sends a price, total or deposit", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { itemId: 1, quantity: 1, merged: false } } as never);

    await addToCart({ productId: 7, mode: "BUY", quantity: 1 });

    const body = JSON.stringify(vi.mocked(api.post).mock.calls[0]![1]);
    for (const forbidden of ["price", "subtotal", "total", "deposit", "unitPrice"]) {
      expect(body.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("patches one line by id", async () => {
    vi.mocked(api.patch).mockResolvedValue({
      data: { itemId: 4, quantity: 3, merged: false },
    } as never);

    await expect(updateCartItem(4, { quantity: 3 })).resolves.toMatchObject({ quantity: 3 });
    expect(api.patch).toHaveBeenCalledWith("/cart/items/4", { quantity: 3 });
  });

  it("stops an invalid patch before it leaves the browser", async () => {
    await expect(updateCartItem(4, { quantity: 0 })).rejects.toThrow();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("removes a line by id", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { removed: true } } as never);

    await removeCartItem(4);
    expect(api.delete).toHaveBeenCalledWith("/cart/items/4");
  });

  it("empties the cart through the collection endpoint", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { cleared: 3 } } as never);

    await expect(clearCart()).resolves.toBe(3);
    expect(api.delete).toHaveBeenCalledWith("/cart");
  });
});

describe("ownership", () => {
  it("never sends a user id — the server reads it from the session", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { itemId: 1, quantity: 1, merged: false } } as never);
    vi.mocked(api.delete).mockResolvedValue({ data: { removed: true } } as never);
    vi.mocked(api.patch).mockResolvedValue({ data: { itemId: 1, quantity: 1, merged: false } } as never);

    await addToCart({ productId: 1, mode: "BUY", quantity: 1 });
    await updateCartItem(1, { quantity: 2 });
    await removeCartItem(1);

    const calls = [
      ...vi.mocked(api.post).mock.calls,
      ...vi.mocked(api.patch).mock.calls,
      ...vi.mocked(api.delete).mock.calls,
    ];
    for (const call of calls) {
      expect(JSON.stringify(call)).not.toContain("userId");
    }
  });
});

describe("the response carries the server's money", () => {
  it("keeps a deposit out of the subtotal and inside the estimated total", async () => {
    const cart = makeCart([makePurchaseItem(), makeRentalItem({ days: 7, quantity: 1 })]);

    expect(cart.totals.securityDeposits).toBe(500_000);
    expect(cart.totals.estimatedTotal).toBe(cart.totals.subtotal + cart.totals.securityDeposits);
    expect(cart.totals.subtotal).not.toContain(undefined);
  });

  it("counts quantities, not rows, for the badge", async () => {
    const cart = makeCart([makePurchaseItem({ quantity: 3 }), makeRentalItem({ quantity: 2 })]);
    expect(cart.totals.itemCount).toBe(2);
    expect(cart.totals.quantityCount).toBe(5);
  });
});
