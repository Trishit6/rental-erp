import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrdersPage } from "@/features/orders";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import { OrderSummary } from "@/features/orders/components/OrderSummary";
import { OrdersEmptyState } from "@/features/orders/components/OrdersEmptyState";
import { getOrderByRef, getOrders } from "@/features/orders/api";
import { queryKeys } from "@/lib/query/keys";
import {
  makeOrderListResponse,
  makeOrderSummary,
  makeRentalOrderSummary,
} from "./support/order-fixtures";

const navigateMock = vi.hoisted(() => vi.fn());
const searchState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@tanstack/react-router", () => ({
  // Substitutes params into the href so links are asserted for real.
  Link: ({ to, params, children }: { to?: string; params?: Record<string, string>; children?: ReactNode }) => {
    const href = to?.includes("$")
      ? to.replace(/\/\$(\w+)/g, (_, key: string) => `/${params?.[key] ?? ""}`)
      : to;
    return <a href={href}>{children}</a>;
  },
  useNavigate: () => navigateMock,
  useSearch: () => searchState.current,
  useParams: () => ({}),
}));

vi.mock("@/features/orders/api", () => ({
  getOrders: vi.fn(),
  getOrderByRef: vi.fn(),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPage() {
  return render(<OrdersPage />, { wrapper });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  navigateMock.mockReset();
  searchState.current = {};
  vi.mocked(getOrderByRef).mockReset();
  vi.mocked(getOrders).mockResolvedValue(makeOrderListResponse([makeOrderSummary()]));
});

describe("the order list", () => {
  it("renders the page heading and the server's order count", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("My Orders")).toBeInTheDocument());
    expect(
      screen.getByText("Track and manage everything you've purchased or rented on Revaro."),
    ).toBeInTheDocument();
    // The count arrives with the data, not with the heading.
    await waitFor(() => expect(screen.getByText("1 order")).toBeInTheDocument());
  });

  it("shows a skeleton, not an empty state, while loading", () => {
    vi.mocked(getOrders).mockReturnValue(new Promise(() => {}));
    renderPage();

    // The flash of "No orders yet" on every navigation is the bug this guards.
    expect(screen.getByTestId("orders-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("No orders yet")).not.toBeInTheDocument();
  });

  it("shows the empty state only when the request has answered with nothing", async () => {
    vi.mocked(getOrders).mockResolvedValue(makeOrderListResponse([]));
    renderPage();

    await waitFor(() => expect(screen.getByText("No orders yet")).toBeInTheDocument());
    expect(screen.getByText("Your Revaro journey starts here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start Browsing/i })).toHaveAttribute(
      "href",
      "/browse",
    );
  });

  it("distinguishes 'no orders match' from 'you have no orders'", async () => {
    // Telling someone with forty orders that they have none, because a filter is
    // applied, is exactly the empty-state bug this avoids.
    searchState.current = { status: "DELIVERED" };
    vi.mocked(getOrders).mockResolvedValue(makeOrderListResponse([]));
    renderPage();

    await waitFor(() => expect(screen.getByText("No orders found")).toBeInTheDocument());
    expect(screen.queryByText("No orders yet")).not.toBeInTheDocument();
  });
});

describe("the order card", () => {
  it("shows the public order number, never the raw id", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Order #RV-2026-8F3K2A")).toBeInTheDocument());
    // The auto-increment id leaks order volume and must not be customer-facing.
    expect(screen.queryByText("Order #11")).not.toBeInTheDocument();
  });

  it("shows the product, the seller, the type and the total", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Sony Headphones")).toBeInTheDocument());
    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.getByText("Purchase")).toBeInTheDocument();
    expect(screen.getByText("₹5,048")).toBeInTheDocument();
    expect(screen.getByText(/Placed on/)).toBeInTheDocument();
  });

  it("counts additional items from the server, not the visible slice", async () => {
    vi.mocked(getOrders).mockResolvedValue(
      makeOrderListResponse([makeOrderSummary({ itemCount: 3 })]),
    );
    renderPage();

    // `itemCount` is the server's total, so a paginated list still says "+2 more".
    await waitFor(() => expect(screen.getByText("+ 2 more items")).toBeInTheDocument());
  });

  it("labels a rental order and shows its rental state", async () => {
    vi.mocked(getOrders).mockResolvedValue(
      makeOrderListResponse([makeRentalOrderSummary()]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Canon 200D DSLR")).toBeInTheDocument());
    const card = screen.getByTestId("order-card-RV-2026-QW7T2M");
    expect(within(card).getByText("Rental")).toBeInTheDocument();
    // The badge reads "Active" because the card already says "Rental". The
    // prefixed form only appears in the filter chips.
    expect(within(card).getByText("Active")).toBeInTheDocument();
  });

  it("links to the order by its public number", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /View details/i })).toHaveAttribute(
        "href",
        "/orders/RV-2026-8F3K2A",
      ),
    );
  });

  it("names a Rent & Buy order correctly", async () => {
    vi.mocked(getOrders).mockResolvedValue(
      makeOrderListResponse([makeOrderSummary({ orderType: "MIXED" })]),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Rent & Buy")).toBeInTheDocument());
  });
});

describe("search, filter and sort drive the URL", () => {
  it("puts a search into the URL and resets to page 1", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Sony Headphones");

    await user.type(screen.getByLabelText("Search orders"), "head");

    await waitFor(
      () => expect(navigateMock).toHaveBeenCalled(),
      { timeout: 2000 },
    );
    const call = navigateMock.mock.calls.at(-1)![0];
    expect(call.to).toBe("/orders");
    expect(call.search.search).toBe("head");
    // A filter change must not leave the customer stranded on an empty page 7.
    expect(call.search.page).toBeUndefined();
  });

  it("toggles a status filter and clears it again", async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await screen.findByText("Sony Headphones");

    await user.click(screen.getByRole("button", { name: "Delivered" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    // The URL carries the enum value, not the display label.
    expect(navigateMock.mock.calls.at(-1)![0].search.status).toBe("DELIVERED");

    // The router mock does not move the URL, so re-render as if it had.
    searchState.current = { status: "DELIVERED" };
    view.rerender(<OrdersPage />);

    await user.click(screen.getByRole("button", { name: "Delivered" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(2));
    expect(navigateMock.mock.calls.at(-1)![0].search.status).toBeUndefined();
  });

  it("keeps the sort when filters are cleared", async () => {
    const user = userEvent.setup();
    searchState.current = { status: "DELIVERED", sort: "total_desc" };
    renderPage();
    await screen.findByText("Sony Headphones");

    await user.click(screen.getByRole("button", { name: /^Clear$/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const call = navigateMock.mock.calls.at(-1)![0];
    // Clearing filters is not the same as resetting the whole view.
    expect(call.search.status).toBeUndefined();
    expect(call.search.sort).toBe("total_desc");
  });

  it("sends the chosen filters to the server rather than filtering locally", async () => {
    searchState.current = { status: "DELIVERED", type: "RENTAL", page: 2 };
    renderPage();

    await waitFor(() => expect(getOrders).toHaveBeenCalled());
    expect(getOrders).toHaveBeenCalledWith(
      expect.objectContaining({ status: "DELIVERED", type: "RENTAL", page: 2 }),
    );
  });
});

describe("errors", () => {
  it("explains a failure and offers a retry", async () => {
    vi.mocked(getOrders).mockRejectedValue(new Error("boom"));
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("We couldn't load your orders")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("sends a signed-out customer to sign in", async () => {
    const { ApiError } = await import("@/lib/api/client");
    vi.mocked(getOrders).mockRejectedValue(new ApiError("UNAUTHENTICATED", "nope", 401));
    renderPage();

    await waitFor(() => expect(screen.getByText("Please sign in")).toBeInTheDocument());
  });
});

describe("presentation details", () => {
  it("never communicates status by colour alone", () => {
    render(<OrderStatusBadge status="DELIVERED" />);
    // Text plus an icon: survives greyscale, colour-blindness and dark mode.
    const badge = screen.getByText("Delivered");
    expect(badge).toBeInTheDocument();
    expect(badge.querySelector("svg")).toBeTruthy();
  });

  it("renders a status it does not recognise instead of blanking", () => {
    render(<OrderStatusBadge status="OUT_FOR_DELIVERY" />);
    expect(screen.getByText("Out For Delivery")).toBeInTheDocument();
  });

  it("separates the rental charge from the security deposit in the totals", () => {
    render(
      <OrderSummary
        amounts={{
          subtotal: 35_000,
          deliveryFee: 0,
          depositTotal: 50_000,
          discount: 0,
          tax: 0,
          total: 85_000,
          currency: "INR",
        }}
        rentalAmount={35_000}
      />,
    );
    const list = screen.getByTestId("order-summary");
    expect(within(list).getByText("Rental charges")).toBeInTheDocument();
    // A deposit shown as an ordinary charge reads as a purchase.
    expect(within(list).getByText(/Security deposit/)).toBeInTheDocument();
    expect(within(list).getByText(/Refundable/)).toBeInTheDocument();
  });

  it("links the empty state to browse", () => {
    render(<OrdersEmptyState variant="none" />);
    expect(screen.getByRole("link", { name: /Start Browsing/i })).toHaveAttribute("href", "/browse");
  });
});

describe("cache keys", () => {
  it("gives each filter combination its own cache entry", async () => {
    const options = (await import("@/features/orders/query")).ordersListQueryOptions({
      status: "DELIVERED",
    });
    const other = (await import("@/features/orders/query")).ordersListQueryOptions({
      status: "SHIPPED",
    });
    expect(options.queryKey).not.toEqual(other.queryKey);
    // The whole list lives under one prefix, so one invalidation covers it all.
    expect(options.queryKey[0]).toBe(queryKeys.orders[0]);
  });
});
