import { describe, expect, it } from "vitest";
import { computeRentToOwnCredit, rentToOwnPrice, evaluateRentToOwnBuy } from "../server/lib/rent-to-own";
import { computeCancellationRefund, parseRentalCancellationPolicy } from "../server/lib/rental-cancellation";
import { extensionCharge, extensionTax, isExtensionApprovalExpired } from "../server/lib/rental-extension";
import { planLegacyPaidMigration, LEGACY_PAID_STATUS } from "../server/lib/legacy-order-status";
import { readCheckoutContext, serializeCheckoutMetadata } from "../server/lib/payments/checkout-context";

describe("R6 rent-to-own math", () => {
  it("caps credit by purchase price and percentage", () => {
    const res = computeRentToOwnCredit(
      { purchasePrice: 5000, rentCreditPercentage: 50, rentCreditCap: 10000 },
      { rentalSubtotal: 15000 },
    );
    expect(res).toBe(5000);
  });
  it("applies cap below percentage", () => {
    const res = computeRentToOwnCredit(
      { purchasePrice: 10000, rentCreditPercentage: 50, rentCreditCap: 2000 },
      { rentalSubtotal: 8000 },
    );
    expect(res).toBe(2000);
  });
  it("floors negative/zero", () => {
    expect(computeRentToOwnCredit({ purchasePrice: 0, rentCreditPercentage: 50, rentCreditCap: 1000 }, { rentalSubtotal: 5000 })).toBe(0);
    expect(computeRentToOwnCredit({ purchasePrice: 5000, rentCreditPercentage: -10, rentCreditCap: 1000 }, { rentalSubtotal: 5000 })).toBe(0);
  });
  it("price is purchase minus credit", () => {
    const p = rentToOwnPrice({ purchasePrice: 8000, rentCreditPercentage: 25, rentCreditCap: 5000 }, { rentalSubtotal: 4000 });
    expect(p).toEqual({ purchasePrice: 8000, credit: 1000, price: 7000 });
  });
  it("preconditions block purchase", () => {
    const r = evaluateRentToOwnBuy({
      rentalStatus: "CONFIRMED",
      alreadyPurchased: true,
      product: { purchasePrice: 5000, rentCreditPercentage: 10, rentCreditCap: 500, rentToOwnEnabled: true, availableQuantity: 1 },
      rental: { rentalSubtotal: 1000 },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });
});

describe("R6 cancellation policy", () => {
  it("full refund before start", () => {
    const policy = parseRentalCancellationPolicy({ fullRefundBeforeStart: true, depositAlwaysRefunded: true, afterStartRentalRefundPercent: 0 });
    const start = new Date("2026-10-20T00:00:00Z");
    const now = new Date("2026-10-19T12:00:00Z");
    const res = computeCancellationRefund({
      policy,
      rental: { rentalSubtotal: 5000, securityDeposit: 2000, startDate: start },
      captured: 8000,
      alreadyRefunded: 0,
      now,
    });
    expect(res.beforeStart).toBe(true);
    expect(res.total).toBe(7000);
  });
  it("partial after start", () => {
    const policy = parseRentalCancellationPolicy({ fullRefundBeforeStart: false, depositAlwaysRefunded: true, afterStartRentalRefundPercent: 50 });
    const start = new Date("2026-10-19T00:00:00Z");
    const now = new Date("2026-10-20T12:00:00Z");
    const res = computeCancellationRefund({
      policy,
      rental: { rentalSubtotal: 5000, securityDeposit: 2000, startDate: start },
      captured: 8000,
      alreadyRefunded: 0,
      now,
    });
    expect(res.beforeStart).toBe(false);
    expect(res.rentalRefund).toBe(2500);
    expect(res.total).toBe(4500);
  });
  it("caps by captured", () => {
    const policy = parseRentalCancellationPolicy({ fullRefundBeforeStart: true, depositAlwaysRefunded: true, afterStartRentalRefundPercent: 0 });
    const start = new Date("2026-10-20T00:00:00Z");
    const now = new Date("2026-10-19T00:00:00Z");
    const res = computeCancellationRefund({
      policy,
      rental: { rentalSubtotal: 5000, securityDeposit: 2000, startDate: start },
      captured: 5000,
      alreadyRefunded: 0,
      now,
    });
    expect(res.total).toBe(5000);
  });
});

describe("R6 extension math", () => {
  it("charge is difference of totals", () => {
    expect(extensionCharge({ oldRate: 100, newRate: 100, currentDays: 2, newDays: 5 })).toBe(300);
    expect(extensionCharge({ oldRate: 100, newRate: 50, currentDays: 5, newDays: 7 })).toBe(0);
  });
  it("tax computes", () => {
    expect(extensionTax(1000, 18)).toBe(180);
    expect(extensionTax(1000, 0)).toBe(0);
    expect(extensionTax(1000, null)).toBe(0);
  });
  it("approval expires after 24h", () => {
    const approved = new Date("2026-10-17T00:00:00Z");
    const later = new Date("2026-10-18T01:00:00Z");
    expect(isExtensionApprovalExpired(approved, later)).toBe(true);
  });
});

describe("R6 legacy PAID mapping", () => {
  it("maps to CONFIRMED when no rentals", () => {
    const plans = planLegacyPaidMigration([
      { id: 1, orderNumber: "X", status: LEGACY_PAID_STATUS, paymentStatus: "PENDING", hasSucceededPayment: true, allRentalsClosed: false, pendingPaymentTransactionId: null, hasRentals: false },
    ]);
    expect(plans[0].to).toBe("CONFIRMED");
    expect(plans[0].promoteTransactionId).toBeNull();
  });
  it("maps to COMPLETED when all rentals closed", () => {
    const plans = planLegacyPaidMigration([
      { id: 2, orderNumber: "Y", status: LEGACY_PAID_STATUS, paymentStatus: "PENDING", hasSucceededPayment: false, allRentalsClosed: true, pendingPaymentTransactionId: 5, hasRentals: true },
    ]);
    expect(plans[0].to).toBe("COMPLETED");
    expect(plans[0].promoteTransactionId).toBe(5);
  });
  it("skips non-legacy", () => {
    const plans = planLegacyPaidMigration([
      { id: 3, orderNumber: "Z", status: "CONFIRMED", paymentStatus: "PAID", hasSucceededPayment: true, allRentalsClosed: false, pendingPaymentTransactionId: null, hasRentals: false },
    ]);
    expect(plans.length).toBe(0);
  });
});

describe("checkout context purpose", () => {
  it("defaults to CART with rentalId null", () => {
    const m = serializeCheckoutMetadata({ deliveryMethod: "PICKUP", deliveryAddressId: null }, []);
    expect(readCheckoutContext(m)).toMatchObject({ purpose: "CART", rentalId: null });
  });
  it("roundtrips extra purpose", () => {
    const m = serializeCheckoutMetadata(
      { purpose: "RENTAL_BUY", deliveryMethod: "PICKUP", deliveryAddressId: null, rentalId: 7 },
      [],
      { rentToOwn: { price: 1000 } },
    );
    const c = readCheckoutContext(m);
    expect(c?.purpose).toBe("RENTAL_BUY");
    expect(c?.rentalId).toBe(7);
  });
});
