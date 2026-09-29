import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartDrawerProvider, useCartDrawer } from "@/lib/cart/drawer";
import { CartDrawerTrigger } from "@/features/cart/components/CartDrawerTrigger";
import { CartDrawerHost } from "@/features/cart";
import { getCart, removeCartItem, updateCartItem } from "@/features/cart/api";
import { queryKeys } from "@/lib/query/keys";
import { makeCart, makeCartProduct, makePurchaseItem, makeRentalItem } from "./support/cart-fixtures";

const authState = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: authState.user, loading: false, refresh: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, onClick }: { to?: string; children?: ReactNode; onClick?: () => void }) => (
    <a href={to} onClick={onClick}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ href: "/browse" }),
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

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <CartDrawerProvider>{children}</CartDrawerProvider>
    </QueryClientProvider>
  );
}

function renderDrawer() {
  return render(
    <Providers>
      <CartDrawerTrigger />
      <CartDrawerHost />
    </Providers>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { id: 1 };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(updateCartItem).mockResolvedValue({ itemId: 10, quantity: 1, merged: false });
  vi.mocked(removeCartItem).mockResolvedValue(undefined);
});

describe("the cart trigger", () => {
  it("shows the shared count, not a row count", async () => {
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem({ quantity: 3 })]));

    renderDrawer();

    expect(await screen.findByRole("button", { name: "Cart, 3 items" })).toBeInTheDocument();
  });

  it("says so when the cart is empty", () => {
    client.setQueryData(queryKeys.cart, makeCart([]));

    renderDrawer();

    expect(screen.getByRole("button", { name: "Cart, empty" })).toBeInTheDocument();
  });

  it("opens the drawer in place rather than navigating away", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem()]));

    renderDrawer();
    await user.click(screen.getByRole("button", { name: /Cart/ }));

    expect(await screen.findByRole("dialog", { name: "Your cart" })).toBeInTheDocument();
  });
});

describe("the drawer", () => {
  it("shows the lines and the server's totals from cache, with no loading state", async () => {
    const cart = makeCart([
      makePurchaseItem({ id: 10 }),
      makeRentalItem({
        id: 11,
        days: 7,
        product: makeCartProduct({ id: 2, title: "Canon EOS R6", slug: "canon-eos-r6" }),
      }),
    ]);
    client.setQueryData(queryKeys.cart, cart);
    vi.mocked(getCart).mockClear();

    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole("button", { name: /Cart/ }));

    expect(await screen.findByRole("dialog", { name: "Your cart" })).toBeInTheDocument();
    expect(screen.getByText("Sony WH-1000XM5")).toBeInTheDocument();
    expect(screen.getByText("Canon EOS R6")).toBeInTheDocument();
    expect(screen.getByText("Rent · 7d")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    // Cached data was enough — no spinner, no waiting on the network.
    expect(screen.queryByRole("status", { name: "Loading your cart" })).not.toBeInTheDocument();
    expect(getCart).not.toHaveBeenCalled();
  });

  it("keeps the deposit visible and separate from the charge", async () => {
    const cart = makeCart([makeRentalItem({ id: 11, days: 7, quantity: 1 })]);
    client.setQueryData(queryKeys.cart, cart);

    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole("button", { name: /Cart/ }));

    expect(await screen.findByText("Refundable deposits")).toBeInTheDocument();
  });

  it("sends the user to the full cart rather than checking out from the drawer", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem()]));

    renderDrawer();
    await user.click(screen.getByRole("button", { name: /Cart/ }));

    const link = await screen.findByRole("link", { name: /View cart/ });
    expect(link).toHaveAttribute("href", "/cart");
  });

  it("changes a quantity through the shared cart mutation", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem({ id: 10, quantity: 1 })]));

    renderDrawer();
    await user.click(screen.getByRole("button", { name: /Cart/ }));
    await user.click(
      await screen.findByRole("button", { name: "Increase quantity of Sony WH-1000XM5" }),
    );

    await waitFor(() => expect(updateCartItem).toHaveBeenCalledWith(10, { quantity: 2 }));
  });

  it("will not go below one", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem({ id: 10, quantity: 1 })]));

    renderDrawer();
    await user.click(screen.getByRole("button", { name: /Cart/ }));

    const decrease = await screen.findByRole("button", {
      name: "Decrease quantity of Sony WH-1000XM5",
    });
    expect(decrease).toBeDisabled();
  });

  it("removes a line through the shared mutation", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem({ id: 10 })]));

    renderDrawer();
    await user.click(screen.getByRole("button", { name: /Cart/ }));
    await user.click(await screen.findByRole("button", { name: "Remove Sony WH-1000XM5 from cart" }));

    await waitFor(() => expect(removeCartItem).toHaveBeenCalledWith(10));
  });

  it("invites the user to browse when there is nothing in it", async () => {
    const user = userEvent.setup();
    client.setQueryData(queryKeys.cart, makeCart([]));

    renderDrawer();
    await user.click(screen.getByRole("button", { name: /Cart/ }));

    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
  });

  it("never requests the cart for a guest", () => {
    authState.user = null;
    client.setQueryData(queryKeys.cart, undefined);
    vi.mocked(getCart).mockClear();

    renderDrawer();

    expect(getCart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cart, empty" })).toBeInTheDocument();
  });
});

describe("the shared drawer state", () => {
  it("is one owner, so the navbar and a product page open the same drawer", async () => {
    const user = userEvent.setup();

    function Opener() {
      const { open } = useCartDrawer();
      return (
        <button type="button" onClick={open}>
          Open from a product page
        </button>
      );
    }

    client.setQueryData(queryKeys.cart, makeCart([makePurchaseItem()]));
    render(
      <Providers>
        <CartDrawerTrigger />
        <Opener />
        <CartDrawerHost />
      </Providers>,
    );

    await user.click(screen.getByRole("button", { name: "Open from a product page" }));
    expect(await screen.findByRole("dialog", { name: "Your cart" })).toBeInTheDocument();
  });
});
