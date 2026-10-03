import { describe, expect, it } from "vitest";
import {
  createOrderNumber,
  formatOrderNumber,
  isOrderNumber,
  orderNumberSuffix,
  ORDER_NUMBER_PREFIX,
} from "../server/lib/payments/order-number";
import {
  readCheckoutContext,
  serializeCheckoutMetadata,
} from "../server/lib/payments/checkout-context";
import { readPaymentConfig } from "../server/lib/payments";

describe("order numbers", () => {
  it("uses the product prefix and a year", () => {
    const orderNumber = createOrderNumber(2026);
    expect(orderNumber.startsWith(`${ORDER_NUMBER_PREFIX}-2026-`)).toBe(true);
  });

  it("is not the database id and does not encode ordering", () => {
    // A sequential customer-facing number leaks order volume; these are random,
    // so sorting them tells you nothing about when the orders came in.
    const numbers = Array.from({ length: 40 }, () => orderNumberSuffix());
    expect(new Set(numbers).size).toBeGreaterThan(35);
    expect(numbers[0]).not.toBe(numbers[1]);
  });

  it("draws from an alphabet with no ambiguous characters", () => {
    // 0/O and 1/I/L are the characters that get misread when an order number
    // is quoted over the phone or copied off a screen.
    for (let i = 0; i < 200; i += 1) {
      expect(orderNumberSuffix()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    }
  });

  it("recognises its own numbers and rejects others", () => {
    expect(isOrderNumber(createOrderNumber(2026))).toBe(true);
    expect(isOrderNumber("RV-2026-000000")).toBe(false);
    expect(isOrderNumber("RV-2026-8F3K2")).toBe(false);
    expect(isOrderNumber("12")).toBe(false);
    expect(isOrderNumber(null)).toBe(false);
  });

  it("formats a supplied suffix", () => {
    expect(formatOrderNumber("8F3K2A", 2026)).toBe("RV-2026-8F3K2A");
  });
});

describe("the context a payment remembers", () => {
  it("round-trips the delivery choice and address", () => {
    const metadata = serializeCheckoutMetadata(
      { deliveryMethod: "DELIVERY", deliveryAddressId: 4 },
      ["PAYMENT_SUCCEEDED"],
    );

    expect(readCheckoutContext(metadata)).toEqual({
      deliveryMethod: "DELIVERY",
      deliveryAddressId: 4,
    });
  });

  it("round-trips pickup with no address", () => {
    const metadata = serializeCheckoutMetadata(
      { deliveryMethod: "PICKUP", deliveryAddressId: null },
      [],
    );

    expect(readCheckoutContext(metadata)).toEqual({
      deliveryMethod: "PICKUP",
      deliveryAddressId: null,
    });
  });

  it("returns null for missing or corrupt metadata instead of throwing", () => {
    // A payment with unreadable metadata is a state to handle, not a crash —
    // the webhook must still answer the provider.
    for (const raw of [null, "", "not json", "[]", '"a string"', "{}", "null"]) {
      expect(readCheckoutContext(raw)).toBeNull();
    }
  });

  it("rejects an unknown delivery method", () => {
    expect(
      readCheckoutContext(JSON.stringify({ checkout: { deliveryMethod: "TELEPORT" } })),
    ).toBeNull();
  });

  it("never stores an amount in the context", () => {
    // The amount lives on the transaction row. A second copy in metadata would
    // be a second, weaker source of truth for what was charged.
    const metadata = serializeCheckoutMetadata(
      { deliveryMethod: "PICKUP", deliveryAddressId: null },
      ["PAYMENT_SUCCEEDED"],
    );

    expect(metadata).not.toMatch(/"amount"|"total"/);
  });
});

describe("provider configuration", () => {
  it("selects the development mock when nothing is configured", () => {
    const config = readPaymentConfig({});
    expect(config.isDevelopmentMock).toBe(true);
    expect(config.provider).toBe("dev_mock");
  });

  it("treats the usual mock aliases as the mock", () => {
    for (const value of ["", "mock", "MOCK", "dev_mock", "none"]) {
      expect(readPaymentConfig({ PAYMENT_PROVIDER: value }).isDevelopmentMock).toBe(true);
    }
  });

  it("recognises a real provider name and carries its keys", () => {
    const config = readPaymentConfig({
      PAYMENT_PROVIDER: "razorpay",
      PAYMENT_KEY_ID: "key_123",
      PAYMENT_KEY_SECRET: "secret_456",
      PAYMENT_WEBHOOK_SECRET: "hook_789",
    });

    expect(config.isDevelopmentMock).toBe(false);
    expect(config.provider).toBe("razorpay");
    expect(config.keySecret).toBe("secret_456");
    expect(config.webhookSecret).toBe("hook_789");
  });
});
