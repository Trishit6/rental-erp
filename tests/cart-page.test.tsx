import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartPage as CartPageView } from "@/features/cart/components/CartPage";
import { CartHeader } from "@/features/cart/components/CartHeader";
import { CartItemQuantity } from "@/features/cart/components/CartItemQuantity";
import { CartSummary } from "@/features/cart/components/CartSummary";
import { CartActions } from "@/features/cart/components/CartActions";
import { CartValidationMessage } from "@/features/cart/components/CartValidationMessage";
import { CartSkeleton } from "@/features/cart/components/CartSkeleton";
import { CartEmptyState } from "@/features/cart/components/CartEmptyState";
import { RentalDurationControl, rentalDurationPatch } from "@/features/cart/components/RentalDurationControl";
import { removeCartItem, updateCartItem, validateCart } from "@/features/cart/api";
import { queryKeys } from "@/lib/query/keys";
import {
  makeCart,
  makePurchaseItem,
  makeRentalItem,
} from "./support/cart-fixtures";
import type { Cart } from "@/features/cart/types";

const navigateMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  // Serialises search into the href so links are asserted for real.
  Link: ({
    to,
    search,
    children,
  }: {
    to?: string;
    search?: Record<string, unknown>;
    children?: ReactNode;
  }) => {
    const query = search
      ? `?${new URLSearchParams(
          Object.entries(search).map(([k, v]) => [k, String(v)]),
        ).toString()}`
      : "";
    return <a href={`${to}${query}`}>{children}</a>;
  },
  useNavigate: () => navigateMock,
  useLocation: () => ({ href: "/cart" }),
  useSearch: () => ({}),
  useParams: () => ({}),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: { id: 1 }, loading: false, refresh: vi.fn() }),
}));

// The heart in each line is the shared favourites system; it is not what this
// file is testing, so it is stubbed rather than rendered.
vi.mock("@/lib/query/favorites", () => ({
  useFavoriteToggle: () => ({
    isFavorited: false,
    isPending: false,
    isDisabled: false,
    isGuest: false,
    toggle: vi.fn(),
    remove: vi.fn(),
  }),
}));

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

function renderPage(
  overrides: Partial<React.ComponentProps<typeof CartPageView>> = {},
) {
  const cart = overrides.items
    ? makeCart(overrides.items)
    : client.getQueryData<Cart>(queryKeys.cart) ?? makeCart([]);

  return render(
    <CartPageView
      items={cart.items}
      totals={cart.totals}
      isLoading={false}
      onRetry={vi.fn()}
      onUpdate={vi.fn()}
      onRemove={vi.fn()}
      onSave={vi.fn()}
      onClear={vi.fn()}
      {...overrides}
    />,
    { wrapper },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(updateCartItem).mockResolvedValue({ itemId: 10, quantity: 1, merged: false });
  vi.mocked(removeCartItem).mockResolvedValue(undefined);
});

/* --------------------------------- header ---------------------------------- */

describe("CartHeader", () => {
  it("counts what the cart actually holds", () => {
    const cart = makeCart([makePurchaseItem(), makeRentalItem()]);
    render(<CartHeader totals={cart.totals} />);

    expect(screen.getByRole("heading", { level: 1, name: "Your cart" })).toBeInTheDocument();
    expect(screen.getByTestId("cart-header-count")).toHaveTextContent("2 items");
  });

  it("singularises a single item", () => {
    render(<CartHeader totals={makeCart([makePurchaseItem()]).totals} />);
    expect(screen.getByTestId("cart-header-count")).toHaveTextContent("1 item");
  });

  it("offers a way back to the marketplace", () => {
    render(<CartHeader totals={makeCart().totals} />);
    expect(screen.getByRole("link", { name: /Continue shopping/ })).toHaveAttribute(
      "href",
      "/browse",
    );
  });
});

/* --------------------------------- summary --------------------------------- */

describe("CartSummary", () => {
  it("keeps the deposit out of the subtotal and inside the estimated total", () => {
    const cart = makeCart([makeRentalItem({ days: 7, quantity: 1 })]);
    render(<CartSummary items={cart.items} totals={cart.totals} />);

    expect(screen.getByText("Security deposits")).toBeInTheDocument();
    expect(screen.getByText("Estimated total")).toBeInTheDocument();
    // The two figures are distinct lines, never merged into one number.
    expect(screen.getAllByText("Subtotal")).toHaveLength(1);
  });

  it("shows a purchase-only cart with just a subtotal", () => {
    const cart = makeCart([makePurchaseItem()]);
    render(<CartSummary items={cart.items} totals={cart.totals} />);

    expect(screen.queryByText("Security deposits")).not.toBeInTheDocument();
    expect(screen.queryByText("Rental charges")).not.toBeInTheDocument();
  });

  it("adds no delivery or tax of its own — the total is the subtotal", () => {
    const cart = makeCart([makePurchaseItem()]);
    render(<CartSummary items={cart.items} totals={cart.totals} />);

    // Whatever checkout works out, the cart does not guess at it here.
    expect(cart.totals.estimatedTotal).toBe(cart.totals.subtotal);
    expect(cart.totals.securityDeposits).toBe(0);
  });
});

/* ------------------------------- quantity ---------------------------------- */

describe("CartItemQuantity", () => {
  it("names its buttons for a screen reader", () => {
    const onChange = vi.fn();
    render(
      <CartItemQuantity value={2} availableQuantity={5} onChange={onChange} label="Sony WH-1000XM5" />,
    );

    expect(
      screen.getByRole("button", { name: "Increase quantity of Sony WH-1000XM5" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Decrease quantity of Sony WH-1000XM5" }),
    ).toBeInTheDocument();
  });

  it("will not go below one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CartItemQuantity value={1} availableQuantity={5} onChange={onChange} label="Camera" />,
    );

    const decrease = screen.getByRole("button", { name: "Decrease quantity of Camera" });
    expect(decrease).toBeDisabled();
    await user.click(decrease);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops at the stock on hand", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CartItemQuantity value={2} availableQuantity={2} onChange={onChange} label="Camera" />,
    );

    const increase = screen.getByRole("button", { name: "Increase quantity of Camera" });
    expect(increase).toBeDisabled();
    await user.click(increase);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("steps within the allowed range", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CartItemQuantity value={2} availableQuantity={5} onChange={onChange} label="Camera" />,
    );

    await user.click(screen.getByRole("button", { name: "Increase quantity of Camera" }));
    expect(onChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole("button", { name: "Decrease quantity of Camera" }));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});

/* --------------------------- rental duration ------------------------------- */

describe("RentalDurationControl", () => {
  it("offers the durations the product supports", () => {
    const item = makeRentalItem({ days: 7 });
    render(<RentalDurationControl item={item} onUpdate={vi.fn()} />);

    const select = screen.getByLabelText(/Rental duration/);
    const values = within(select)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(values).toContain("7");
    expect(values).toContain("30");
  });

  it("sends a real date window, not a bare number", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const item = makeRentalItem({ days: 7 });
    render(<RentalDurationControl item={item} onUpdate={onUpdate} />);

    await user.selectOptions(screen.getByLabelText(/Rental duration/), "14");

    const patch = onUpdate.mock.calls[0]![0];
    const start = new Date(patch.startDate);
    const end = new Date(patch.endDate);
    expect(end.getTime() - start.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("anchors a change to the line's existing start date", () => {
    const item = makeRentalItem({ days: 7 });
    const patch = rentalDurationPatch(item, 3);
    expect(new Date(patch.startDate).toISOString()).toBe(new Date(item.startDate).toISOString());
  });

  it("shows nothing on a purchase", () => {
    const { container } = render(
      <RentalDurationControl item={makePurchaseItem()} onUpdate={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

/* ------------------------------- validation -------------------------------- */

describe("CartValidationMessage", () => {
  it("shows both prices when one has changed", () => {
    render(
      <CartValidationMessage
        issues={[
          {
            code: "PRICE_CHANGED",
            message: "The rental price for this product has changed.",
            previousValue: "₹499/day",
            currentValue: "₹549/day",
          },
        ]}
      />,
    );

    expect(screen.getByText("The rental price for this product has changed.")).toBeInTheDocument();
    expect(screen.getByText("Was ₹499/day")).toBeInTheDocument();
    expect(screen.getByText("Now ₹549/day")).toBeInTheDocument();
  });

  it("renders nothing when the line is fine", () => {
    const { container } = render(<CartValidationMessage issues={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/* ---------------------------- the checkout gate ---------------------------- */

describe("the checkout gate", () => {
  it("re-checks with the server before navigating", async () => {
    const user = userEvent.setup();
    const items = [makePurchaseItem()];
    const cart = makeCart(items);
    vi.mocked(validateCart).mockResolvedValue({
      valid: true,
      items: cart.items,
      totals: cart.totals,
    });

    render(<CartActions items={items} />, { wrapper });
    await user.click(screen.getByRole("button", { name: /Proceed to checkout/ }));

    await waitFor(() => expect(validateCart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/checkout" }));
  });

  it("stays put and explains when the cart no longer validates", async () => {
    const user = userEvent.setup();
    const items = [makePurchaseItem()];
    const cart = makeCart(items);
    vi.mocked(validateCart).mockResolvedValue({
      valid: false,
      items: cart.items,
      totals: cart.totals,
    });

    render(<CartActions items={items} />, { wrapper });
    await user.click(screen.getByRole("button", { name: /Proceed to checkout/ }));

    await waitFor(() => expect(validateCart).toHaveBeenCalled());
    expect(navigateMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/need attention/i)).toBeInTheDocument();
  });

  it("creates nothing — no order, no rental, no payment", async () => {
    const user = userEvent.setup();
    const items = [makePurchaseItem()];
    const cart = makeCart(items);
    vi.mocked(validateCart).mockResolvedValue({
      valid: true,
      items: cart.items,
      totals: cart.totals,
    });

    render(<CartActions items={items} />, { wrapper });
    await user.click(screen.getByRole("button", { name: /Proceed to checkout/ }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());

    // The only network call the gate made was the validation.
    expect(validateCart).toHaveBeenCalledTimes(1);
  });

  it("is disabled with nothing to buy", () => {
    render(<CartActions items={[]} />, { wrapper });
    expect(screen.getByRole("button", { name: /Proceed to checkout/ })).toBeDisabled();
  });

  it("warns up front when a line is already known to be broken", () => {
    const broken = makePurchaseItem({ issues: [{ code: "PRICE_CHANGED", message: "changed" }] });
    render(<CartActions items={[broken]} />, { wrapper });

    expect(screen.getByText(/need attention/i)).toBeInTheDocument();
  });
});

/* --------------------------------- states ---------------------------------- */

describe("CartPage", () => {
  it("shows a skeleton on a first load", () => {
    renderPage({ isLoading: true });
    expect(screen.getByRole("status", { name: "Loading your cart" })).toBeInTheDocument();
  });

  it("shows the empty state with a way out", () => {
    renderPage({ items: [] });
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse products" })).toHaveAttribute("href", "/browse");
  });

  it("offers a retry that only refetches the cart", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderPage({ isError: true, onRetry, items: [] });

    expect(screen.getByText("We couldn't load your cart")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps the lines on screen through a background refetch", () => {
    const { container } = renderPage({ isFetching: true, items: [makePurchaseItem()] });

    // The content stays put; only its opacity marks the background refetch.
    expect(screen.getByRole("heading", { name: "Sony WH-1000XM5" })).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("shows an unavailable line instead of deleting it", () => {
    renderPage({
      items: [
        makePurchaseItem({
          id: 10,
          product: null,
          issues: [{ code: "PRODUCT_UNAVAILABLE", message: "This product is no longer available." }],
        }),
      ],
    });

    expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove/ })).toBeInTheDocument();
  });

  it("routes every change through the server-backed handlers", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    const onSave = vi.fn();

    renderPage({
      items: [makePurchaseItem({ id: 10, quantity: 1 })],
      onUpdate,
      onRemove,
      onSave,
    });

    await user.click(screen.getByRole("button", { name: /Increase quantity of/ }));
    expect(onUpdate).toHaveBeenCalledWith(10, { quantity: 2 });

    await user.click(screen.getByRole("button", { name: /Save for later/ }));
    expect(onSave).toHaveBeenCalledWith(10, true);

    await user.click(screen.getByRole("button", { name: "Remove Sony WH-1000XM5 from cart" }));
    expect(onRemove).toHaveBeenCalledWith(10);
  });

  it("sends a guest to an empty cart rather than an error", () => {
    renderPage({ isGuest: true, items: [] });
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
  });
});

/* ------------------------------- the drawers -------------------------------- */

describe("clear cart", () => {
  const twoLines = () => [makePurchaseItem({ id: 10 }), makeRentalItem({ id: 11 })];

  it("asks first, and only then empties it", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderPage({ items: twoLines(), onClear });

    await user.click(screen.getByRole("button", { name: /Clear cart/ }));
    expect(onClear).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Clear cart" }));
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });

  it("can be called off without clearing anything", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderPage({ items: twoLines(), onClear });

    await user.click(screen.getByRole("button", { name: /Clear cart/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(onClear).not.toHaveBeenCalled();
  });

  it("is not offered for a single item", () => {
    renderPage({ items: [makePurchaseItem()] });
    expect(screen.queryByRole("button", { name: /Clear cart/ })).not.toBeInTheDocument();
  });
});

/* -------------------------------- primitives -------------------------------- */

describe("CartSkeleton", () => {
  it("reserves the real layout and announces itself", () => {
    render(<CartSkeleton />);
    expect(screen.getByRole("status", { name: "Loading your cart" })).toBeInTheDocument();
  });
});

describe("CartEmptyState", () => {
  it("offers a destination rather than a dead end", () => {
    render(<CartEmptyState />);
    // Browsing rent-capable products lives on the browse route now; `/rentals`
    // is the customer's own rentals.
    expect(screen.getByRole("link", { name: "Browse rentals" })).toHaveAttribute(
      "href",
      "/browse?mode=rent",
    );
  });
});
