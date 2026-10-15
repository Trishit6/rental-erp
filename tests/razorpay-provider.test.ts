import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRazorpayProvider } from "../server/lib/payments/razorpay-provider";
import { createHmac } from "node:crypto";

const CONFIG = {
  keyId: "rzp_test_key",
  keySecret: "rzp_test_secret",
  webhookSecret: "rzp_webhook_secret",
};

function setFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  globalThis.fetch = vi.fn(handler) as unknown as typeof globalThis.fetch;
}

describe("Razorpay provider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an order and returns its id", async () => {
    setFetch(async () => {

      return new Response(JSON.stringify({ id: "order_123", amount: 49900, currency: "INR" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const provider = createRazorpayProvider(CONFIG);
    const intent = await provider.createIntent({
      amount: 49900,
      currency: "INR",
      idempotencyKey: "k_1",
    });
    expect(intent.providerPaymentId).toBe("order_123");
    expect(intent.amount).toBe(49900);
    expect(intent.status).toBe("PENDING");
  });

  it("rejects a forged checkout signature", async () => {
    const provider = createRazorpayProvider(CONFIG);
    const result = await provider.verifyPayment({
      providerPaymentId: "order_123",
      paymentId: "pay_1",
      signature: "deadbeef",
    });
    expect(result.verified).toBe(false);
  });

  it("accepts a valid checkout signature and captured payment", async () => {
    const valid = createHmac("sha256", CONFIG.keySecret)
      .update("order_123|pay_1")
      .digest("hex");
    setFetch(async () =>
      new Response(
        JSON.stringify({ id: "pay_1", order_id: "order_123", amount: 49900, currency: "INR", status: "captured" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = createRazorpayProvider(CONFIG);
    const result = await provider.verifyPayment({
      providerPaymentId: "order_123",
      paymentId: "pay_1",
      signature: valid,
    });
    expect(result.verified).toBe(true);
    expect(result.amount).toBe(49900);
    expect(result.status).toBe("SUCCEEDED");
  });

  it("verifies webhook signatures", () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac("sha256", CONFIG.webhookSecret).update(body).digest("hex");
    const provider = createRazorpayProvider(CONFIG);
    expect(provider.verifyWebhookSignature(body, sig)).toBe(true);
    expect(provider.verifyWebhookSignature(body, "wrong")).toBe(false);
  });

  it("parses a captured event", () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1", order_id: "order_123", amount: 49900, currency: "INR" } } },
    });
    const provider = createRazorpayProvider(CONFIG);
    const ev = provider.parseWebhookEvent(body);
    expect(ev?.status).toBe("SUCCEEDED");
    expect(ev?.providerPaymentId).toBe("order_123");
  });
});
