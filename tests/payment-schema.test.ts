import { describe, expect, it } from "vitest";
import {
  idempotencyKeySchema,
  isPaymentMethod,
  newIdempotencyKey,
  parsePaymentSearch,
  statusCopy,
  stepForStatus,
  verifyPaymentSchema,
} from "@/features/payment/components/schema";
import { isReviewRequired, isTerminalPaymentStatus } from "@/features/payment/types";

describe("reading the checkout context from the URL", () => {
  it("defaults to delivery with no address", () => {
    expect(parsePaymentSearch({})).toEqual({
      deliveryMethod: "DELIVERY",
      deliveryAddressId: null,
    });
  });

  it("accepts an address as a number", () => {
    // TanStack Router JSON-parses search params, so this is the real shape.
    expect(parsePaymentSearch({ addressId: 12 }).deliveryAddressId).toBe(12);
  });

  it("accepts an address as a numeric string", () => {
    // A hand-typed or stringified URL arrives this way.
    expect(parsePaymentSearch({ addressId: "12" }).deliveryAddressId).toBe(12);
  });

  it("never throws on junk — a bad param degrades to no address", () => {
    // Throwing here would take the whole route down over a mistyped URL.
    for (const input of [
      { addressId: "abc" },
      { addressId: -4 },
      { addressId: 0 },
      { addressId: 1.5 },
      { addressId: {} },
      { addressId: null },
      { addressId: "1; DROP TABLE orders" },
    ]) {
      expect(parsePaymentSearch(input).deliveryAddressId).toBeNull();
    }
  });

  it("falls back to delivery for an unknown method", () => {
    expect(parsePaymentSearch({ deliveryMethod: "TELEPORT" }).deliveryMethod).toBe("DELIVERY");
    expect(parsePaymentSearch({ deliveryMethod: "PICKUP" }).deliveryMethod).toBe("PICKUP");
  });
});

describe("choosing the right screen", () => {
  it("treats pending and processing as the same 'wait' screen", () => {
    // Neither state implies a certainty, so neither may imply an outcome.
    expect(stepForStatus("PENDING")).toBe("processing");
    expect(stepForStatus("PROCESSING")).toBe("processing");
  });

  it("maps every settled status to its own outcome", () => {
    expect(stepForStatus("SUCCEEDED")).toBe("success");
    expect(stepForStatus("FAILED")).toBe("failed");
    expect(stepForStatus("CANCELLED")).toBe("cancelled");
    expect(stepForStatus("REFUNDED")).toBe("failed");
  });

  it("stops polling once a payment is terminal", () => {
    // An unbounded poll on a settled payment is a battery and rate-limit
    // problem for no possible change.
    expect(isTerminalPaymentStatus("SUCCEEDED")).toBe(true);
    expect(isTerminalPaymentStatus("FAILED")).toBe(true);
    expect(isTerminalPaymentStatus("CANCELLED")).toBe(true);
    expect(isTerminalPaymentStatus("PENDING")).toBe(false);
    expect(isTerminalPaymentStatus("PROCESSING")).toBe(false);
  });
});

describe("copy", () => {
  it("never claims success before the server has confirmed", () => {
    const pending = statusCopy("PENDING");
    expect(pending.title).toMatch(/being processed/i);
    expect(pending.description).toMatch(/don't close/i);
    expect(pending.title).not.toMatch(/success/i);
  });

  it("names the order once one exists", () => {
    expect(statusCopy("SUCCEEDED", "RV-2026-8F3K2A").description).toContain("RV-2026-8F3K2A");
  });

  it("reassures on failure that no money moved", () => {
    // The only question a customer has at this point.
    expect(statusCopy("FAILED").description).toMatch(/not been charged/i);
  });

  it("says the cart survives a cancellation", () => {
    expect(statusCopy("CANCELLED").description).toMatch(/cart is untouched/i);
  });
});

describe("which failures need review rather than a retry", () => {
  it("routes amount and cart problems to review", () => {
    // Retrying a payment that can never succeed is worse than useless.
    for (const code of [
      "PAYMENT_AMOUNT_CHANGED",
      "CART_UNAVAILABLE",
      "EMPTY_CART",
      "ADDRESS_REQUIRED",
    ]) {
      expect(isReviewRequired(code)).toBe(true);
    }
  });

  it("routes a genuine failure to retry", () => {
    expect(isReviewRequired("PAYMENT_FAILED")).toBe(false);
    expect(isReviewRequired("RATE_LIMITED")).toBe(false);
  });
});

describe("input validation", () => {
  it("recognises only the four supported methods", () => {
    expect(isPaymentMethod("UPI")).toBe(true);
    expect(isPaymentMethod("CARD")).toBe(true);
    expect(isPaymentMethod("NET_BANKING")).toBe(true);
    expect(isPaymentMethod("WALLET")).toBe(true);
    expect(isPaymentMethod("CRYPTO")).toBe(false);
    expect(isPaymentMethod(null)).toBe(false);
  });

  it("accepts only a known method, and nothing else, on verification", () => {
    // There is deliberately no `signature`, `success` or `amount` field to
    // validate: the server asks the provider, so the request carries nothing
    // that could assert an outcome.
    expect(verifyPaymentSchema.safeParse({}).success).toBe(true);
    expect(verifyPaymentSchema.safeParse({ paymentMethod: "UPI" }).success).toBe(true);
    expect(verifyPaymentSchema.safeParse({ paymentMethod: "CRYPTO" }).success).toBe(false);
    expect(verifyPaymentSchema.safeParse({ signature: "forged" }).success).toBe(false);
  });

  it("rejects a weak idempotency key", () => {
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("x".repeat(200)).success).toBe(false);
    expect(idempotencyKeySchema.safeParse(newIdempotencyKey()).success).toBe(true);
  });

  it("mints a distinct key each time", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
