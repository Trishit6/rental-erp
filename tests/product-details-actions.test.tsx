import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useProductActions } from "@/features/product-details/query";
import { addProductToCart } from "@/lib/query/cart";
import {
  buildRentalOptions,
  productActions,
} from "@/features/product-details/components/schema";
import { makeProduct } from "./support/product-fixtures";

const { navigateMock, toastMock, openCartMock, authState } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastMock: vi.fn(),
  openCartMock: vi.fn(),
  authState: { user: null as { id: number } | null },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ href: "/product/sony-wh-1000xm5" }),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: authState.user }),
}));

// Adding to the cart now opens the shared drawer. That is UI state, not part of
// what this test measures, so it is stubbed rather than rendered.
vi.mock("@/lib/cart/drawer", () => ({
  useCartDrawer: () => ({ isOpen: false, open: openCartMock, close: vi.fn(), setOpen: vi.fn() }),
}));

// The cart mutation is the shared one from `lib/query/cart`. The hook stays real
// so this test still exercises the real mutation path — only the HTTP call is
// stubbed, so there is one implementation in production code and in the test.
vi.mock("@/lib/query/cart", async () => {
  const { useMutation } =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  const addProductToCart = vi.fn();
  return {
    addProductToCart,
    cartErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : "Couldn't update your cart. Try again.",
    useAddToCart: () =>
      useMutation({ mutationFn: (payload: unknown) => addProductToCart(payload) }),
  };
});

const FROM = new Date("2026-02-01T00:00:00.000Z");

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = null;
  vi.mocked(addProductToCart).mockResolvedValue(undefined);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("useProductActions", () => {
  it("sends a guest to sign in instead of failing silently", () => {
    const { result } = renderHook(
      () => useProductActions({ product: makeProduct(), quantity: 1, rentalOption: null }),
      { wrapper },
    );

    act(() => result.current.run(productActions("BUY", true)[0]));

    expect(addProductToCart).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith("Sign in to continue", expect.anything());
  });

  it("passes the product, mode and quantity to the cart", async () => {
    authState.user = { id: 1 };
    const { result } = renderHook(
      () => useProductActions({ product: makeProduct(), quantity: 3, rentalOption: null }),
      { wrapper },
    );

    act(() => result.current.run(productActions("BUY", true)[0]));

    await waitFor(() =>
      expect(addProductToCart).toHaveBeenCalledWith({ productId: 1, mode: "BUY", quantity: 3 }),
    );
    expect(toastMock).toHaveBeenCalledWith("Added to cart");
    // The drawer is the confirmation: the user stays on the product page and can
    // see the cart immediately, rather than being navigated away.
    expect(openCartMock).toHaveBeenCalledTimes(1);
  });

  it("carries the selected rental window into the cart", async () => {
    authState.user = { id: 1 };
    const product = makeProduct();
    const rentalOption = buildRentalOptions(product, FROM)[0];

    const { result } = renderHook(
      () => useProductActions({ product, quantity: 1, rentalOption }),
      { wrapper },
    );

    act(() => result.current.run(productActions("RENT", true)[0]));

    await waitFor(() =>
      expect(addProductToCart).toHaveBeenCalledWith({
        productId: product.id,
        mode: "RENT",
        quantity: 1,
        startDate: rentalOption.startDate,
        endDate: rentalOption.endDate,
      }),
    );
  });

  it("never sends a rental that has no dates", () => {
    authState.user = { id: 1 };
    const { result } = renderHook(
      () => useProductActions({ product: makeProduct(), quantity: 1, rentalOption: null }),
      { wrapper },
    );

    act(() => result.current.run(productActions("RENT", true)[0]));

    expect(addProductToCart).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalled();
  });

  it("hands off to checkout for an immediate purchase", async () => {
    authState.user = { id: 1 };
    const { result } = renderHook(
      () => useProductActions({ product: makeProduct(), quantity: 1, rentalOption: null }),
      { wrapper },
    );

    act(() => result.current.run(productActions("BUY", true)[1]));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/checkout" }));
  });
});
