import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import {
  cancelPayment,
  createPaymentIntent,
  getPaymentProviderInfo,
  getPaymentStatus,
  getPaymentSummary,
  verifyPayment,
} from "@/features/payment/api";

vi.mock("@/lib/api/client", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

const INTENT = {
  transactionId: 7,
  provider: "dev_mock",
  providerPaymentId: "mock_pay_abc",
  amount: 499_00,
  currency: "INR",
  status: "PENDING",
  isProductionReady: false,
  resumable: true,
  clientSecret: "secret",
};

const CONFIRMATION = {
  orderId: 12,
  orderNumber: "RV-2026-8F3K2A",
  status: "CONFIRMED",
  paymentStatus: "PAID",
  total: 499_00,
  currency: "INR",
  rentalCount: 0,
  created: true,
};

describe("reading payment state", () => {
  it("reads the provider's available methods rather than assuming any", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { provider: "dev_mock", isProductionReady: false, currency: "INR", methods: [], isDevelopmentMock: true },
    } as never);

    await getPaymentProviderInfo();

    expect(api.get).toHaveBeenCalledWith("/payments/methods");
  });

  it("asks for the summary with the checkout context", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { breakdown: { grandTotal: 1 } } } as never);

    await getPaymentSummary({ deliveryMethod: "DELIVERY", deliveryAddressId: 4 });

    // The key name is the server's schema, not the URL's `addressId`.
    expect(api.get).toHaveBeenCalledWith("/payments/summary?deliveryMethod=DELIVERY&deliveryAddressId=4");
  });

  it("omits the address entirely for pickup", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} } as never);

    await getPaymentSummary({ deliveryMethod: "PICKUP", deliveryAddressId: null });

    expect(api.get).toHaveBeenCalledWith("/payments/summary?deliveryMethod=PICKUP");
  });

  it("reads one payment's status by id", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { status: "PENDING" } } as never);

    await getPaymentStatus(7);

    expect(api.get).toHaveBeenCalledWith("/payments/7");
  });
});

describe("opening a payment", () => {
  it("sends only the choices, the method and the idempotency key", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: INTENT } as never);

    await createPaymentIntent({
      deliveryMethod: "DELIVERY",
      deliveryAddressId: 4,
      paymentMethod: "UPI",
      idempotencyKey: "revaro_key_0001",
    });

    expect(api.post).toHaveBeenCalledWith("/payments/intents", {
      deliveryMethod: "DELIVERY",
      deliveryAddressId: 4,
      paymentMethod: "UPI",
      idempotencyKey: "revaro_key_0001",
    });
  });

  it("sends no amount, total or user id — the server prices the cart itself", async () => {
    // The central security property of this feature, asserted on the exact
    // payload: there is no field here a browser could use to state a price or
    // an owner. Adding one would be the vulnerability.
    vi.mocked(api.post).mockResolvedValue({ data: INTENT } as never);

    await createPaymentIntent({
      deliveryMethod: "PICKUP",
      deliveryAddressId: null,
      paymentMethod: "CARD",
      idempotencyKey: "revaro_key_0002",
    });

    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(body).sort()).toEqual([
      "deliveryAddressId",
      "deliveryMethod",
      "idempotencyKey",
      "paymentMethod",
    ]);
    expect(body).not.toHaveProperty("amount");
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("sellerId");
  });
});

describe("confirming a payment", () => {
  it("asks the server to confirm, sending only the method", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: CONFIRMATION } as never);

    const result = await verifyPayment(7, { paymentMethod: "UPI" });

    expect(api.post).toHaveBeenCalledWith("/payments/7/verify", { paymentMethod: "UPI" });
    expect(result.orderNumber).toBe("RV-2026-8F3K2A");
  });

  it("lets the server decide the outcome — the client asserts nothing", async () => {
    // The central security property: there is no field here a browser could use
    // to claim a payment succeeded. A `success: true` in this body would be
    // exactly the bug the whole design exists to prevent.
    vi.mocked(api.post).mockResolvedValue({ data: CONFIRMATION } as never);

    await verifyPayment(7, {});

    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(body)).toEqual([]);
    expect(body).not.toHaveProperty("success");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("paymentStatus");
    expect(body).not.toHaveProperty("amount");
  });
});

describe("cancelling a payment", () => {
  it("asks the server to cancel and sends nothing else", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { transactionId: 7, status: "CANCELLED" } } as never);

    await cancelPayment(7);

    expect(api.post).toHaveBeenCalledWith("/payments/7/cancel");
  });
});
