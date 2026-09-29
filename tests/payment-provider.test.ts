import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { createMockPaymentProvider } from "../server/lib/payments/mock-provider";
import { HttpError } from "../server/lib/api";
import type { PaymentProvider } from "../server/lib/payments/types";

/**
 * The development provider is the only piece of the payment stack that can be
 * tested without a database, so these tests carry more weight than usual: they
 * pin the behaviour every real provider will have to reproduce.
 */

let provider: PaymentProvider;

beforeEach(() => {
  provider = createMockPaymentProvider();
});

const INPUT = { amount: 499_00, currency: "INR", idempotencyKey: "revaro_key_0001" };

describe("intent creation", () => {
  it("opens a pending intent for the requested amount", async () => {
    const intent = await provider.createIntent(INPUT);

    expect(intent.amount).toBe(499_00);
    expect(intent.currency).toBe("INR");
    expect(intent.status).toBe("PENDING");
    expect(intent.providerPaymentId).toMatch(/^mock_pay_/);
    expect(intent.clientSecret).toBeTruthy();
  });

  it("rejects a non-integer or non-positive amount", async () => {
    // Floating-point money is the bug this guards: a provider that silently
    // rounds would let the order total and the charge drift apart.
    await expect(provider.createIntent({ ...INPUT, amount: 499.5 })).rejects.toThrow(HttpError);
    await expect(provider.createIntent({ ...INPUT, amount: 0 })).rejects.toThrow(HttpError);
    await expect(provider.createIntent({ ...INPUT, amount: -100 })).rejects.toThrow(HttpError);
  });

  it("is idempotent — the same key never opens a second intent", async () => {
    const first = await provider.createIntent(INPUT);
    const second = await provider.createIntent(INPUT);

    // A double-clicked Pay button lands here. Two charges must not result.
    expect(second.providerPaymentId).toBe(first.providerPaymentId);
    expect(second.clientSecret).toBe(first.clientSecret);
  });

  it("gives a different intent to a different key", async () => {
    const first = await provider.createIntent(INPUT);
    const second = await provider.createIntent({ ...INPUT, idempotencyKey: "revaro_key_0002" });

    expect(second.providerPaymentId).not.toBe(first.providerPaymentId);
  });
});

describe("verification", () => {
  it("confirms only when the client echoes the exact secret it was issued", async () => {
    const intent = await provider.createIntent(INPUT);

    const result = await provider.verifyPayment({
      providerPaymentId: intent.providerPaymentId,
      signature: intent.clientSecret,
    });

    expect(result.verified).toBe(true);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.amount).toBe(499_00);
  });

  it("answers from provider state when the server asks without proof", async () => {
    // No signature means the *server* is asking "did this complete?" — which is
    // the whole verification path, and why a resumed intent is still payable.
    const intent = await provider.createIntent(INPUT);

    const result = await provider.verifyPayment({ providerPaymentId: intent.providerPaymentId });

    expect(result.verified).toBe(true);
    expect(result.status).toBe("SUCCEEDED");
  });

  it("still refuses a signature that is present but wrong", async () => {
    // A forged or replayed proof must fail even in development.
    const intent = await provider.createIntent(INPUT);

    const result = await provider.verifyPayment({
      providerPaymentId: intent.providerPaymentId,
      signature: "not-the-secret",
    });

    expect(result.verified).toBe(false);
    expect(result.status).toBe("FAILED");
  });

  it("leaves a bad signature retryable rather than closing the attempt", async () => {
    // A customer whose redirect returned a beat late must be able to retry.
    // Marking the payment FAILED on the first bad proof would make one
    // interrupted attempt permanently unpayable.
    const intent = await provider.createIntent(INPUT);

    const bad = await provider.verifyPayment({
      providerPaymentId: intent.providerPaymentId,
      signature: "wrong",
    });
    expect(bad.isTerminal).toBe(false);

    // The same intent still completes with the right proof.
    const good = await provider.verifyPayment({
      providerPaymentId: intent.providerPaymentId,
      signature: intent.clientSecret,
    });
    expect(good.verified).toBe(true);
    expect(good.status).toBe("SUCCEEDED");
  });

  it("treats an unrecognised payment as terminal", async () => {
    // There is nothing to retry here — the payment does not exist.
    const result = await provider.verifyPayment({ providerPaymentId: "mock_pay_nope" });

    expect(result.verified).toBe(false);
    expect(result.isTerminal).toBe(true);
  });

  it("refuses a wrong signature", async () => {
    const intent = await provider.createIntent(INPUT);

    const result = await provider.verifyPayment({
      providerPaymentId: intent.providerPaymentId,
      signature: "not-the-secret",
    });

    expect(result.verified).toBe(false);
  });

  it("refuses a secret belonging to a different intent", async () => {
    const a = await provider.createIntent(INPUT);
    const b = await provider.createIntent({ ...INPUT, idempotencyKey: "revaro_key_0003" });

    // Replaying one payment's proof against another must fail.
    const result = await provider.verifyPayment({
      providerPaymentId: b.providerPaymentId,
      signature: a.clientSecret,
    });

    expect(result.verified).toBe(false);
  });

  it("reports an unknown payment rather than throwing", async () => {
    const result = await provider.verifyPayment({ providerPaymentId: "mock_pay_nope" });

    expect(result.verified).toBe(false);
    expect(result.status).toBe("FAILED");
  });

  it("stays successful when the same intent is verified twice", async () => {
    // A webhook and a browser response can both confirm one payment. The
    // second must be a no-op, not a second charge.
    const intent = await provider.createIntent(INPUT);
    const first = await provider.verifyPayment({
      providerPaymentId: intent.providerPaymentId,
      signature: intent.clientSecret,
    });
    const second = await provider.verifyPayment({
      providerPaymentId: intent.providerPaymentId,
      signature: intent.clientSecret,
    });

    expect(first.verified).toBe(true);
    expect(second.verified).toBe(true);
    expect(second.status).toBe("SUCCEEDED");
  });
});

describe("cancellation", () => {
  it("cancels a pending intent", async () => {
    const intent = await provider.createIntent(INPUT);

    const result = await provider.cancelPayment({
      providerPaymentId: intent.providerPaymentId,
    });

    expect(result.cancelled).toBe(true);
    expect(result.status).toBe("CANCELLED");
  });

  it("refuses to cancel a settled payment", async () => {
    // Cancelling must never look like it reversed money that already moved.
    const intent = await provider.createIntent(INPUT);
    await provider.verifyPayment({
      providerPaymentId: intent.providerPaymentId,
      signature: intent.clientSecret,
    });

    const result = await provider.cancelPayment({
      providerPaymentId: intent.providerPaymentId,
    });

    expect(result.cancelled).toBe(false);
    expect(result.status).toBe("SUCCEEDED");
  });

  it("reports an unknown payment rather than throwing", async () => {
    const result = await provider.cancelPayment({ providerPaymentId: "mock_pay_nope" });
    expect(result.cancelled).toBe(false);
  });
});

describe("webhooks", () => {
  const body = JSON.stringify({
    eventId: "evt_1",
    type: "payment.succeeded",
    providerPaymentId: "mock_pay_x",
    status: "SUCCEEDED",
    amount: 499_00,
    currency: "INR",
  });

  it("accepts a correctly signed body", () => {
    const signature = signBody(body);
    expect(provider.verifyWebhookSignature(body, signature)).toBe(true);
  });

  it("rejects a missing, wrong or tampered signature", () => {
    expect(provider.verifyWebhookSignature(body, undefined)).toBe(false);
    expect(provider.verifyWebhookSignature(body, "deadbeef")).toBe(false);
    // The signature covers the body, so changing the amount breaks it.
    expect(provider.verifyWebhookSignature(body.replace("49900", "100"), signBody(body))).toBe(
      false,
    );
  });

  it("parses a well-formed event", () => {
    const event = provider.parseWebhookEvent(body);
    expect(event).toMatchObject({
      eventId: "evt_1",
      providerPaymentId: "mock_pay_x",
      status: "SUCCEEDED",
      amount: 499_00,
    });
  });

  it("returns null for malformed payloads rather than throwing", () => {
    expect(provider.parseWebhookEvent("not json")).toBeNull();
    expect(provider.parseWebhookEvent(JSON.stringify({ eventId: "evt_1" }))).toBeNull();
  });
});

describe("production safety", () => {
  it("never claims to be production ready", () => {
    expect(provider.isProductionReady).toBe(false);
  });
});

/**
 * The mock signs with a key defined inside the provider module itself. The test
 * rebuilds that key deliberately rather than importing it: a signature check
 * that is exercised only with a value the module itself produced proves nothing.
 * If the provider ever accepts a different key, or any key, this fails.
 */
function signBody(raw: string): string {
  return createHmac("sha256", "revaro-dev-only-mock-signing-key").update(raw).digest("hex");
}
