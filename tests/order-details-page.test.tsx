import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderDetailsPage } from "@/features/orders";
import { OrderDetailsTimeline } from "@/features/orders/components/OrderDetailsTimeline";
import { OrderPaymentSummary } from "@/features/orders/components/OrderPaymentSummary";
import { OrderSellerInfo } from "@/features/orders/components/OrderSellerInfo";
import { OrderActionsPanel } from "@/features/orders/components/OrderActionsPanel";
import { getOrderByRef } from "@/features/orders/api";
import { ApiError } from "@/lib/api/client";
import { format } from "date-fns";
import { buildOrderTimeline } from "@/features/orders/components/schema";
import {
  makeOrderDetail,
  makeOrderDetails,
  makeOrderItem,
  makeRental,
  makeRentalItem,
  makeRentalOrderDetails,
} from "./support/order-fixtures";

const paramsState = vi.hoisted(() => ({ current: {} as { orderId?: string } }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children }: { to?: string; params?: Record<string, string>; children?: ReactNode }) => {
    const href = to?.includes("$")
      ? to.replace(/\/\$(\w+)/g, (_, key: string) => `/${params?.[key] ?? ""}`)
      : to;
    return <a href={href}>{children}</a>;
  },
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => paramsState.current,
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
  return render(<OrderDetailsPage />, { wrapper });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  paramsState.current = { orderId: "RV-2026-8F3K2A" };
  vi.mocked(getOrderByRef).mockReset();
  vi.mocked(getOrderByRef).mockResolvedValue(makeOrderDetails());
});

describe("the order detail page", () => {
  it("shows the public order number and the date it was placed", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Order #RV-2026-8F3K2A")).toBeInTheDocument());
    expect(screen.getByText(/Placed on 29 September 2026/)).toBeInTheDocument();
    // The sequential id is never the customer-facing identifier.
    expect(screen.queryByText("Order #11")).not.toBeInTheDocument();
  });

  it("links back to the orders list", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Back to Orders/i })).toHaveAttribute(
        "href",
        "/orders",
      ),
    );
  });

  it("shows a skeleton while loading, then the order", async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(getOrderByRef).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as never,
    );
    renderPage();

    expect(screen.getByTestId("order-details-skeleton")).toBeInTheDocument();
    resolve(makeOrderDetails());
    await waitFor(() => expect(screen.getByText("Order #RV-2026-8F3K2A")).toBeInTheDocument());
  });

  it("lists the items from the snapshot, not the live product", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Sony Headphones")).toBeInTheDocument());
    const item = screen.getByTestId("order-item-101");
    expect(within(item).getByText("Condition: Like New")).toBeInTheDocument();
    expect(within(item).getByText("Qty:")).toBeInTheDocument();
    expect(within(item).getByText("Buy")).toBeInTheDocument();
    // Scoped to the row: the unit price and the line total are both ₹4,999 here.
    expect(within(item).getAllByText("₹4,999").length).toBe(2);
  });

  it("shows a rental charge and a deposit as separate lines, never a single total", async () => {
    vi.mocked(getOrderByRef).mockResolvedValue(makeRentalOrderDetails());
    renderPage();

    await waitFor(() => expect(screen.getByTestId("order-summary")).toBeInTheDocument());
    const totals = screen.getByTestId("order-summary");
    expect(within(totals).getByText("Rental charges")).toBeInTheDocument();
    // A deposit shown as an ordinary charge reads as a purchase.
    expect(within(totals).getByText("Security deposit")).toBeInTheDocument();
    expect(within(totals).getByText(/Refundable/)).toBeInTheDocument();
  });

  it("shows the delivery address from the order's snapshot", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("order-delivery-address")).toBeInTheDocument());
    const address = screen.getByTestId("order-delivery-address");
    expect(within(address).getByText("Asha")).toBeInTheDocument();
    expect(within(address).getByText(/12 Fernhill Road/)).toBeInTheDocument();
    expect(within(address).getByText(/Pune/)).toBeInTheDocument();
  });
});

describe("rental orders", () => {
  beforeEach(() => {
    vi.mocked(getOrderByRef).mockResolvedValue(makeRentalOrderDetails());
  });

  it("shows the rental period, duration and deposit", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("order-rentals")).toBeInTheDocument());
    const rentals = screen.getByTestId("order-rentals");
    // Formatted the same way the component does, so the assertion holds in any
    // timezone rather than only in UTC.
    const start = makeRental().startDate;
    const end = makeRental().endDate;
    expect(rentals).toHaveTextContent(`${format(new Date(start), "d MMM yyyy")}`);
    expect(rentals).toHaveTextContent(`${format(new Date(end), "d MMM yyyy")}`);
    expect(within(rentals).getByText("7 days")).toBeInTheDocument();
    expect(within(rentals).getByText("₹350")).toBeInTheDocument();
    expect(within(rentals).getByText("₹500")).toBeInTheDocument();
  });

  it("shows the item's rental duration and daily rate", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Duration:")).toBeInTheDocument());
    const item = screen.getByTestId("order-item-102");
    expect(within(item).getByText("7 days")).toBeInTheDocument();
    expect(within(item).getByText(/₹50\/day/)).toBeInTheDocument();
  });

  it("labels the order Rent & Buy only when it really is mixed", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Rental")).toBeInTheDocument());
    expect(screen.queryByText("Rent & Buy")).not.toBeInTheDocument();
  });
});

describe("rental information is absent when there is no rental", () => {
  it("renders no rental section for a purchase order", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText("Order #RV-2026-8F3K2A")).toBeInTheDocument());
    // A rental block on a pure purchase would imply terms that do not exist.
    expect(screen.queryByTestId("order-rentals")).not.toBeInTheDocument();
    expect(screen.queryByText("Rental Details")).not.toBeInTheDocument();
  });
});

describe("the payment section", () => {
  it("shows method, status, amount, currency, date and reference", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("order-payment")).toBeInTheDocument());
    const payment = screen.getByTestId("order-payment");
    expect(within(payment).getByText("UPI")).toBeInTheDocument();
    expect(within(payment).getByText("₹5,048")).toBeInTheDocument();
    expect(within(payment).getByText("INR")).toBeInTheDocument();
    expect(within(payment).getByText("mock_pay_9f3c2a")).toBeInTheDocument();
  });

  it("never renders a payment credential, because the type has no field for one", () => {
    render(
      <OrderPaymentSummary
        payment={{
          id: 1,
          type: "PAYMENT",
          amount: 100,
          currency: "INR",
          status: "PAID",
          provider: "razorpay",
          providerTransactionId: "pay_abc",
          paymentMethod: "CARD",
          createdAt: "2026-09-29T05:51:00.000Z",
        }}
        fallbackProvider="razorpay"
      />,
    );
    // The card number, CVV and UPI PIN are simply not in the payload.
    expect(screen.queryByText(/4[0-9]{15}/)).not.toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("says plainly when a development provider recorded the payment", () => {
    render(
      <OrderPaymentSummary
        payment={{
          id: 1,
          type: "PAYMENT",
          amount: 100,
          currency: "INR",
          status: "PAID",
          provider: "dev_mock",
          providerTransactionId: "mock_pay_x",
          paymentMethod: "UPI",
          createdAt: "2026-09-29T05:51:00.000Z",
        }}
        fallbackProvider="dev_mock"
      />,
    );
    expect(screen.getByText(/No real money moved/)).toBeInTheDocument();
  });

  it("handles an order with no payment record", () => {
    render(<OrderPaymentSummary payment={null} fallbackProvider="razorpay" />);
    expect(screen.getByText("No payment record is attached to this order.")).toBeInTheDocument();
  });
});

describe("not found and errors", () => {
  it("renders 'not found' rather than revealing that another user's order exists", async () => {
    // The server returns the same 404 for "missing" and "someone else's", so
    // the UI must not try to tell the two apart.
    vi.mocked(getOrderByRef).mockRejectedValue(
      new ApiError("NOT_FOUND", "Order not found.", 404),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("order-not-found")).toBeInTheDocument());
    expect(screen.getByText("Order not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to orders/i })).toHaveAttribute(
      "href",
      "/orders",
    );
  });

  it("does not retry a 404 — the answer is final", async () => {
    vi.mocked(getOrderByRef).mockRejectedValue(
      new ApiError("NOT_FOUND", "Order not found.", 404),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("order-not-found")).toBeInTheDocument());
    expect(getOrderByRef).toHaveBeenCalledTimes(1);
  });

  it("offers a retry for a genuine failure", async () => {
    vi.mocked(getOrderByRef).mockRejectedValue(new ApiError("INTERNAL_ERROR", "boom", 500));
    renderPage();

    // A 5xx is retried with backoff before surfacing, so allow for that.
    await waitFor(
      () => expect(screen.getByText("We couldn't load your orders")).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("answers a malformed reference locally, without a pointless request", async () => {
    paramsState.current = { orderId: "not-an-order" };
    renderPage();

    await waitFor(() => expect(screen.getByTestId("order-not-found")).toBeInTheDocument());
    expect(getOrderByRef).not.toHaveBeenCalled();
  });

  it("requests by the public number the route carries", async () => {
    renderPage();
    await waitFor(() => expect(getOrderByRef).toHaveBeenCalledWith("RV-2026-8F3K2A"));
  });
});

describe("the timeline", () => {
  it("marks each step and gives a time only where one is recorded", () => {
    render(
      <OrderDetailsTimeline
        events={buildOrderTimeline({
          order: makeOrderDetail(),
          payment: { createdAt: "2026-09-29T05:51:00.000Z", status: "PAID" },
          rentals: [],
        })}
      />,
    );

    const timeline = screen.getByTestId("order-timeline");
    // State is in text, not only colour.
    expect(within(timeline).getByText("Order placed")).toBeInTheDocument();
    expect(within(timeline).getByText("Payment confirmed")).toBeInTheDocument();
    expect(within(timeline).getByText("Delivered")).toBeInTheDocument();
    // No invented timestamps on the fulfilment steps.
    expect(within(timeline).getAllByText("Waiting").length).toBeGreaterThan(0);
  });

  it("renders nothing for an empty event list rather than an empty shell", () => {
    const { container } = render(<OrderDetailsTimeline events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("seller information", () => {
  it("shows only public seller fields and links to the profile", () => {
    render(<OrderSellerInfo sellers={[{ id: 2, name: "Priya", avatarUrl: null, verified: true }]} />);

    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.getByLabelText("Verified seller")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View profile" })).toHaveAttribute("href", "/seller/2");
    // Nothing private is in the payload to leak.
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("renders nothing when the order has no seller data", () => {
    const { container } = render(<OrderSellerInfo sellers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("actions are honest about what exists", () => {
  const detail = makeOrderDetail();

  it("offers only navigations to real pages", () => {
    render(
      <OrderActionsPanel
        order={detail}
        items={[makeOrderItem(), makeRentalItem()]}
        rentals={[makeRental()]}
      />,
      { wrapper },
    );

    expect(screen.getByRole("link", { name: /View my rentals/i })).toHaveAttribute(
      "href",
      "/rentals",
    );
    expect(screen.getByRole("link", { name: /Continue shopping/i })).toHaveAttribute(
      "href",
      "/browse",
    );
    // No tracking or returns: no carrier integration and no returns feature
    // exist, and a dead button is worse than no button.
    expect(screen.queryByText(/Track/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Return item/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Contact seller/i)).not.toBeInTheDocument();
  });

  it("offers cancellation only while the lifecycle still allows it", () => {
    const { rerender } = render(
      <OrderActionsPanel
        order={makeOrderDetail({ status: "CONFIRMED" })}
        items={[makeOrderItem()]}
        rentals={[]}
      />,
      { wrapper },
    );
    expect(screen.getByRole("button", { name: /Cancel order/i })).toBeInTheDocument();

    // Delivered is past the cancellable window in `server/lib/order-cancellation.ts`.
    rerender(
      <OrderActionsPanel
        order={makeOrderDetail({ status: "DELIVERED" })}
        items={[makeOrderItem()]}
        rentals={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Cancel order/i })).not.toBeInTheDocument();
  });

  it("repeats a purchase only while the product is still listed", () => {
    const { rerender } = render(
      <OrderActionsPanel order={detail} items={[makeOrderItem()]} rentals={[]} />,
      { wrapper },
    );
    expect(screen.getByRole("button", { name: /Buy again/i })).toBeInTheDocument();

    // The listing was removed after the order was placed: the receipt stands, but
    // there is nothing to add to a cart.
    rerender(
      <OrderActionsPanel
        order={detail}
        items={[{ ...makeOrderItem(), productSlug: null }]}
        rentals={[]}
      />,
    );
    expect(screen.queryByRole("button", { name: /Buy again/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no longer listed/)).toBeInTheDocument();
  });

  it("repeats a rental as a rental, not as a purchase", () => {
    render(
      <OrderActionsPanel order={detail} items={[makeRentalItem()]} rentals={[makeRental()]} />,
      { wrapper },
    );

    expect(screen.getByRole("button", { name: /Rent again/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Buy again/i })).not.toBeInTheDocument();
  });
});

describe("historical stability", () => {
  it("renders the snapshot name even when the live product has changed", async () => {
    // The product row may since be renamed, re-priced or removed. The receipt
    // keeps showing what was bought.
    vi.mocked(getOrderByRef).mockResolvedValue(
      makeOrderDetails({
        items: [
          {
            ...makeRentalItem(),
            titleSnapshot: "Original Name At Purchase",
            productSlug: null,
            unitPrice: 5_000,
            lineTotal: 85_000,
          },
        ],
      }),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Original Name At Purchase")).toBeInTheDocument(),
    );
  });
});
