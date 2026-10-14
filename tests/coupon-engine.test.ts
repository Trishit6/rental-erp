import { describe, expect, it } from "vitest";
import type { Coupon } from "../server/schema";
import {
  computeCouponDiscount,
  evaluateCouponRules,
  scopedAmounts,
  type CouponLine,
} from "../server/lib/coupon";

/**
 * PROMPT 31 — the coupon engine, pinned without a database.
 *
 * These are the pure rules the checkout and order creation both run: what a code
 * is worth, who it applies to, and when it is refused. A mistake here is a
 * discount that is 100× too big, applies to the wrong seller's items, or eats a
 * refundable deposit — so they are worth testing directly rather than through a
 * checkout flow.
 */

/** A fully-populated coupon row, so a test only states the field it cares about. */
function coupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    id: 1,
    code: "SAVE10",
    description: null,
    discountType: "PERCENT",
    discountValue: 1000,
    maxDiscountPaise: null,
    minimumOrderPaise: 0,
    usageLimit: null,
    perUserLimit: null,
    usedCount: 0,
    startsAt: null,
    endsAt: null,
    status: "ACTIVE",
    appliesTo: "ALL",
    categoryId: null,
    sellerId: null,
    productId: null,
    stackable: false,
    allowDepositDiscount: false,
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** One cart line: ₹1000 charge, ₹500 deposit by default. */
function line(overrides: Partial<CouponLine> = {}): CouponLine {
  return { productId: 10, sellerId: 20, categoryId: 30, charge: 100_000, deposit: 50_000, ...overrides };
}

describe("computeCouponDiscount", () => {
  it("takes a percentage of the charge", () => {
    // 10% of ₹1000 = ₹100.
    expect(
      computeCouponDiscount(coupon({ discountValue: 1000 }), {
        scopedCharge: 100_000,
        scopedDeposit: 0,
        orderTotal: 100_000,
      }),
    ).toBe(10_000);
  });

  it("caps a percentage at maxDiscountPaise", () => {
    // 50% of ₹1000 is ₹500, but the coupon caps at ₹200.
    expect(
      computeCouponDiscount(coupon({ discountValue: 5000, maxDiscountPaise: 20_000 }), {
        scopedCharge: 100_000,
        scopedDeposit: 0,
        orderTotal: 100_000,
      }),
    ).toBe(20_000);
  });

  it("never lets a flat discount exceed the charge", () => {
    // ₹500 off ₹300 of charge is ₹300, not ₹500.
    expect(
      computeCouponDiscount(coupon({ discountType: "FLAT", discountValue: 50_000 }), {
        scopedCharge: 30_000,
        scopedDeposit: 0,
        orderTotal: 30_000,
      }),
    ).toBe(30_000);
  });

  it("leaves the refundable deposit alone by default", () => {
    // 100% off still only reaches the charge, not the ₹500 deposit.
    expect(
      computeCouponDiscount(coupon({ discountValue: 10_000, allowDepositDiscount: false }), {
        scopedCharge: 100_000,
        scopedDeposit: 50_000,
        orderTotal: 150_000,
      }),
    ).toBe(100_000);
  });

  it("discounts the deposit only when the coupon allows it", () => {
    // 100% off with `allowDepositDiscount` reaches the whole ₹1500.
    expect(
      computeCouponDiscount(coupon({ discountValue: 10_000, allowDepositDiscount: true }), {
        scopedCharge: 100_000,
        scopedDeposit: 50_000,
        orderTotal: 150_000,
      }),
    ).toBe(150_000);
  });

  it("can never push the total below zero", () => {
    // A flat discount larger than the whole order is clamped to the order total.
    expect(
      computeCouponDiscount(
        coupon({ discountType: "FLAT", discountValue: 900_000, allowDepositDiscount: true }),
        { scopedCharge: 100_000, scopedDeposit: 50_000, orderTotal: 150_000 },
      ),
    ).toBe(150_000);
  });
});

describe("scopedAmounts", () => {
  const lines = [
    line({ productId: 1, sellerId: 7, categoryId: 100, charge: 10_000, deposit: 5_000 }),
    line({ productId: 2, sellerId: 8, categoryId: 200, charge: 20_000, deposit: 5_000 }),
  ];

  it("matches every line for ALL", () => {
    expect(scopedAmounts(coupon({ appliesTo: "ALL" }), lines)).toEqual({
      scopedCharge: 30_000,
      scopedDeposit: 10_000,
    });
  });

  it("matches only the named category", () => {
    expect(scopedAmounts(coupon({ appliesTo: "CATEGORY", categoryId: 200 }), lines)).toEqual({
      scopedCharge: 20_000,
      scopedDeposit: 5_000,
    });
  });

  it("matches only the named seller", () => {
    expect(scopedAmounts(coupon({ appliesTo: "SELLER", sellerId: 7 }), lines)).toEqual({
      scopedCharge: 10_000,
      scopedDeposit: 5_000,
    });
  });

  it("matches only the named product", () => {
    expect(scopedAmounts(coupon({ appliesTo: "PRODUCT", productId: 2 }), lines)).toEqual({
      scopedCharge: 20_000,
      scopedDeposit: 5_000,
    });
  });

  it("has a base of zero when the scoped target is not in the cart", () => {
    expect(scopedAmounts(coupon({ appliesTo: "SELLER", sellerId: 999 }), lines)).toEqual({
      scopedCharge: 0,
      scopedDeposit: 0,
    });
  });
});

describe("evaluateCouponRules", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("accepts a live code on a matching cart", () => {
    const result = evaluateCouponRules({ coupon: coupon(), lines: [line()], subtotal: 100_000, now });
    expect(result).toEqual({ ok: true, discountPaise: 10_000 });
  });

  it("refuses a paused, retired or expired code", () => {
    for (const status of ["PAUSED", "RETIRED", "EXPIRED"]) {
      const result = evaluateCouponRules({
        coupon: coupon({ status }),
        lines: [line()],
        subtotal: 100_000,
        now,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("refuses a code before its window opens and after it closes", () => {
    expect(
      evaluateCouponRules({
        coupon: coupon({ status: "SCHEDULED", startsAt: new Date("2026-07-01T00:00:00.000Z") }),
        lines: [line()],
        subtotal: 100_000,
        now,
      }).ok,
    ).toBe(false);
    expect(
      evaluateCouponRules({
        coupon: coupon({ endsAt: new Date("2026-05-01T00:00:00.000Z") }),
        lines: [line()],
        subtotal: 100_000,
        now,
      }).ok,
    ).toBe(false);
  });

  it("allows a scheduled code once its window has opened", () => {
    const result = evaluateCouponRules({
      coupon: coupon({ status: "SCHEDULED", startsAt: new Date("2026-05-01T00:00:00.000Z") }),
      lines: [line()],
      subtotal: 100_000,
      now,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses a cart below the minimum order", () => {
    const result = evaluateCouponRules({
      coupon: coupon({ minimumOrderPaise: 200_000 }),
      lines: [line()],
      subtotal: 100_000,
      now,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a scoped code that matches nothing in the cart", () => {
    const result = evaluateCouponRules({
      coupon: coupon({ appliesTo: "CATEGORY", categoryId: 999 }),
      lines: [line()],
      subtotal: 100_000,
      now,
    });
    expect(result).toEqual({ ok: false, message: "This code doesn't apply to anything in your cart." });
  });
});
