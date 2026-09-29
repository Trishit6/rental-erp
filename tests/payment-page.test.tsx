import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PaymentPage } from "@/features/payment/components/PaymentPage";
import { ApiError } from "@/lib/api/client";
import {
  cancelPayment,
  createPaymentIntent,
  getPaymentProviderInfo,
  getPaymentStatus,
  getPaymentSummary,
  verifyPayment,
} from "@/features/payment/api";
import {
  makeOrderConfirmation,
  makePaymentIntent,
  makePaymentProviderInfo,
  makePaymentSummary,
  makeRentalLine,
} from "./support/payment-fixtures";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to?: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ user: { id: 1 }, loading: false, refresh: vi.fn() }),
}));

vi.mock("@/features/payment/api", () => ({
  getPaymentProviderInfo: vi.fn(),
  getPaymentSummary: vi.fn(),
  createPaymentIntent: vi.fn(),
  getPaymentStatus: vi.fn(),
  verifyPayment: vi.fn(),
  cancelPayment: vi.fn(),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPage() {
  return render(<PaymentPage />, { wrapper });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(getPaymentProviderInfo).mockResolvedValue(makePaymentProviderInfo());
  vi.mocked(getPaymentSummary).mockResolvedValue(makePaymentSummary());
  vi.mocked(getPaymentStatus).mockResolvedValue({
    transactionId: 7,
    status: "PENDING",
    amount: 2_994_900,
    currency: "INR",
    paymentMethod: "UPI",
    orderId: null,
    failureReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

describe("the amount is the server's", () => {
  it("shows the breakdown the server sent, adding nothing itself", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("payment-amount")).toBeInTheDocument());
    // 2990000 subtotal + 4900 delivery
    expect(screen.getByTestId("payment-amount")).toHaveTextContent("₹29,949");
    expect(screen.getByText("Delivery")).toBeInTheDocument();
  });

  it("keeps a rental's charges and deposit as separate, labelled figures", async () => {
    // A deposit presented as an ordinary charge reads as a purchase and
    // generates refund requests later, so it gets its own row and the word
    // "refundable".
    vi.mocked(getPaymentSummary).mockResolvedValue(
      makePaymentSummary({ lines: [makeRentalLine()] }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByText("Rental charges")).toBeInTheDocument());
    expect(screen.getByText("Security deposit (refundable)")).toBeInTheDocument();
    expect(screen.getByText(/refundable/i)).toBeInTheDocument();
  });

  it("says plainly that a development payment moves no money", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByTestId("dev-mock-banner")).toBeInTheDocument());
    expect(screen.getByTestId("dev-mock-banner")).toHaveTextContent(/no real money moves/i);
  });
});

describe("choosing a method", () => {
  it("renders only what the provider offers", async () => {
    vi.mocked(getPaymentProviderInfo).mockResolvedValue(
      makePaymentProviderInfo({
        methods: [{ method: "UPI", label: "UPI", description: "Pay securely using UPI" }],
      }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByTestId("payment-methods")).toBeInTheDocument());
    expect(screen.getByTestId("payment-method-UPI")).toBeInTheDocument();
    // A hardcoded list would show all four; availability is the provider's call.
    expect(screen.queryByTestId("payment-method-WALLET")).not.toBeInTheDocument();
  });

  it("exposes the methods as real radio controls", async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole("radiogroup", { hidden: true })).toBeTruthy());
    expect(screen.getByRole("radio", { name: /UPI/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Card/ })).toBeInTheDocument();
  });

  it("will not pay until a method is chosen", async () => {
    renderPage();

    const pay = await screen.findByRole("button", { name: /^Pay/ });
    expect(pay).toBeDisabled();
    expect(screen.getByText("Choose a payment method to continue.")).toBeInTheDocument();
  });
});

describe("paying", () => {
  it("opens an intent, then confirms it before showing success", async () => {
    const user = userEvent.setup();
    vi.mocked(createPaymentIntent).mockResolvedValue(makePaymentIntent());
    vi.mocked(verifyPayment).mockResolvedValue(makeOrderConfirmation());

    renderPage();
    await screen.findByRole("radio", { name: /UPI/ });
    await user.click(screen.getByRole("radio", { name: /UPI/ }));
    await user.click(screen.getByRole("button", { name: /^Pay/ }));

    await waitFor(() => expect(createPaymentIntent).toHaveBeenCalled());
    const intentInput = vi.mocked(createPaymentIntent).mock.calls[0][0];
    // A payment request carries choices only — never a price, never an owner.
    expect(intentInput).not.toHaveProperty("amount");
    expect(intentInput).not.toHaveProperty("userId");
    expect(intentInput.idempotencyKey).toEqual(expect.any(String));

    await waitFor(() => expect(screen.getByTestId("payment-processing")).toBeInTheDocument());
    expect(screen.getByText("Please don't close this window.")).toBeInTheDocument();

    await user.click(await screen.findByTestId("dev-approve"));

    await waitFor(() => expect(screen.getByTestId("payment-success")).toBeInTheDocument());
    // Nothing about the outcome is asserted by the client — the server answers.
    expect(verifyPayment).toHaveBeenCalledWith(7, { paymentMethod: "UPI" });
  });

  it("shows the order number the server returned, not an id it invented", async () => {
    const user = userEvent.setup();
    vi.mocked(createPaymentIntent).mockResolvedValue(makePaymentIntent());
    vi.mocked(verifyPayment).mockResolvedValue(
      makeOrderConfirmation({ orderNumber: "RV-2026-QW7T2M", orderId: 998 }),
    );

    renderPage();
    await screen.findByRole("radio", { name: /UPI/ });
    await user.click(screen.getByRole("radio", { name: /UPI/ }));
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    await user.click(await screen.findByTestId("dev-approve"));

    await waitFor(() => expect(screen.getByTestId("order-number")).toHaveTextContent("RV-2026-QW7T2M"));
    // The auto-increment id must never be the customer-facing identifier.
    expect(screen.getByTestId("order-number")).not.toHaveTextContent("998");
  });

  it("reuses one idempotency key across retries so a double-click cannot double-charge", async () => {
    const user = userEvent.setup();
    vi.mocked(createPaymentIntent).mockResolvedValue(makePaymentIntent());
    vi.mocked(verifyPayment).mockResolvedValue(makeOrderConfirmation());

    renderPage();
    await screen.findByRole("radio", { name: /UPI/ });
    await user.click(screen.getByRole("radio", { name: /UPI/ }));

    const pay = screen.getByRole("button", { name: /^Pay/ });
    await user.click(pay);
    await user.click(pay).catch(() => undefined);
    // Decline, then try again, and the key must not have changed.
    await user.click(await screen.findByRole("button", { name: /Simulate decline/ }));
    await user.click(await screen.findByRole("button", { name: /Resume payment/ }));
    await user.click(screen.getByRole("button", { name: /^Pay/ }));

    await waitFor(() => expect(createPaymentIntent).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(createPaymentIntent).mock.calls.map((c) => c[0].idempotencyKey);
    expect(first).toBe(second);
  });
});

describe("when things go wrong", () => {
  it("sends an amount change back for review rather than charging it", async () => {
    const user = userEvent.setup();
    vi.mocked(createPaymentIntent).mockResolvedValue(makePaymentIntent());
    vi.mocked(verifyPayment).mockRejectedValue(
      new ApiError("PAYMENT_AMOUNT_CHANGED", "The payment amount has changed.", 409),
    );

    renderPage();
    await screen.findByRole("radio", { name: /UPI/ });
    await user.click(screen.getByRole("radio", { name: /UPI/ }));
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    await user.click(await screen.findByTestId("dev-approve"));

    // Never "success", and explicitly asking for a re-check.
    await waitFor(() => expect(screen.getByTestId("payment-review-required")).toBeInTheDocument());
    expect(screen.getByText("Payment amount changed.")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-success")).not.toBeInTheDocument();
  });

  it("reports a genuine failure and promises no charge", async () => {
    const user = userEvent.setup();
    vi.mocked(createPaymentIntent).mockResolvedValue(makePaymentIntent());
    vi.mocked(verifyPayment).mockRejectedValue(
      new ApiError("PAYMENT_FAILED", "Payment could not be completed.", 409),
    );

    renderPage();
    await screen.findByRole("radio", { name: /UPI/ });
    await user.click(screen.getByRole("radio", { name: /UPI/ }));
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    await user.click(await screen.findByTestId("dev-approve"));

    await waitFor(() => expect(screen.getByTestId("payment-failed")).toBeInTheDocument());
    expect(screen.getByTestId("payment-failed")).toHaveTextContent(/not been charged/i);
  });

  it("cancels without emptying the cart", async () => {
    const user = userEvent.setup();
    vi.mocked(createPaymentIntent).mockResolvedValue(makePaymentIntent());
    vi.mocked(cancelPayment).mockResolvedValue({ transactionId: 7, status: "CANCELLED" });

    renderPage();
    await screen.findByRole("radio", { name: /UPI/ });
    await user.click(screen.getByRole("radio", { name: /UPI/ }));
    await user.click(screen.getByRole("button", { name: /^Pay/ }));
    await user.click(await screen.findByRole("button", { name: /Simulate decline/ }));

    await waitFor(() => expect(screen.getByTestId("payment-cancelled")).toBeInTheDocument());
    expect(cancelPayment).toHaveBeenCalledWith(7);
    // No cart-clearing call exists in this feature: the server does that inside
    // the order transaction, and never on cancellation.
    expect(cancelPayment).toHaveBeenCalledTimes(1);
  });

  it("blocks payment entirely when the cart has a problem", async () => {
    vi.mocked(getPaymentSummary).mockResolvedValue(
      makePaymentSummary({
        isPayable: false,
        issues: [{ code: "PRICE_CHANGED", message: "The price of this item has changed." }],
      }),
    );

    renderPage();

    await waitFor(() => expect(screen.getByTestId("payment-issues")).toBeInTheDocument());
    expect(screen.getByText("The price of this item has changed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pay/ })).toBeDisabled();
  });

  it("explains an unreachable payment page without blaming the payment", async () => {
    vi.mocked(getPaymentSummary).mockRejectedValue(new ApiError("INTERNAL_ERROR", "boom", 500));

    renderPage();

    // "Payment failed" would assert something we do not know.
    await waitFor(() => expect(screen.getByText(/couldn't load your payment/i)).toBeInTheDocument());
    expect(screen.queryByTestId("payment-failed")).not.toBeInTheDocument();
  });
});
