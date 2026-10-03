import { describe, expect, it } from "vitest";
import {
  addCartItemSchema,
  canCheckout,
  cartListingTypeSchema,
  clampCartQuantity,
  depositLabel,
  isRental,
  isUnavailable,
  itemCountLabel,
  maxCartQuantity,
  modeLabel,
  primaryIssue,
  removeCartItemSchema,
  rentalDurationsFor,
  unitPriceLabel,
  updateCartItemSchema,
} from "@/features/cart/components/schema";
import { formatInr } from "@/lib/pricing";
import { makeCartProduct, makePurchaseItem, makeRentalItem } from "./support/cart-fixtures";

describe("cart input schemas", () => {
  it("accepts a concrete BUY or RENT line", () => {
    expect(cartListingTypeSchema.parse("BUY")).toBe("BUY");
    expect(cartListingTypeSchema.parse("RENT")).toBe("RENT");
  });

  /* RENT_AND_BUY is a product capability, never a cart mode — the user must
     choose one, so an unresolved mode is rejected here. */
  it("rejects RENT_AND_BUY as a cart mode", () => {
    expect(cartListingTypeSchema.safeParse("RENT_AND_BUY").success).toBe(false);
    expect(addCartItemSchema.safeParse({ productId: 1, mode: "RENT_AND_BUY" }).success).toBe(false);
  });

  it("requires a quantity of at least 1 and no more than 99", () => {
    const base = { productId: 1, mode: "BUY" as const };
    expect(addCartItemSchema.safeParse({ ...base, quantity: 1 }).success).toBe(true);
    expect(addCartItemSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(addCartItemSchema.safeParse({ ...base, quantity: -3 }).success).toBe(false);
    expect(addCartItemSchema.safeParse({ ...base, quantity: 100 }).success).toBe(false);
    expect(addCartItemSchema.safeParse({ ...base, quantity: 2.5 }).success).toBe(false);
  });

  it("demands a date window for a rental", () => {
    const rental = { productId: 1, mode: "RENT" as const, quantity: 1 };
    expect(addCartItemSchema.safeParse(rental).success).toBe(false);
    expect(
      addCartItemSchema.safeParse({
        ...rental,
        startDate: "2026-03-01T00:00:00.000Z",
        endDate: "2026-03-08T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("refuses to put rental dates on a purchase", () => {
    expect(
      addCartItemSchema.safeParse({
        productId: 1,
        mode: "BUY",
        quantity: 1,
        startDate: "2026-03-01T00:00:00.000Z",
        endDate: "2026-03-08T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty cart patch", () => {
    expect(updateCartItemSchema.safeParse({}).success).toBe(false);
    expect(updateCartItemSchema.safeParse({ quantity: 2 }).success).toBe(true);
    expect(updateCartItemSchema.safeParse({ mode: "RENT" }).success).toBe(true);
    expect(updateCartItemSchema.safeParse({ savedForLater: true }).success).toBe(true);
  });

  it("validates the id that reaches the remove endpoint", () => {
    expect(removeCartItemSchema.safeParse({ itemId: 4 }).success).toBe(true);
    expect(removeCartItemSchema.safeParse({ itemId: 0 }).success).toBe(false);
    expect(removeCartItemSchema.safeParse({ itemId: -1 }).success).toBe(false);
  });

  /* None of this replaces the server: the API re-checks product, stock, mode and
     window on every write. It only stops a doomed request leaving the browser. */
  it("is a guard rail, not the authority", () => {
    // The client accepts a well-formed rental the server may still reject as
    // unavailable — that decision is the server's to make.
    expect(
      addCartItemSchema.safeParse({
        productId: 1,
        mode: "RENT",
        quantity: 5,
        startDate: "2026-03-01T00:00:00.000Z",
        endDate: "2026-03-08T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("rental durations", () => {
  it("offers only the presets inside the product's own window", () => {
    expect(
      rentalDurationsFor({
        rentalPricePerDay: 10_000,
        minimumRentalDays: 3,
        maximumRentalDays: 14,
      }),
    ).toEqual([3, 7, 14]);
  });

  it("always includes the minimum, even when no preset fits", () => {
    expect(
      rentalDurationsFor({
        rentalPricePerDay: 10_000,
        minimumRentalDays: 45,
        maximumRentalDays: 60,
      }),
    ).toEqual([45, 60]);
  });

  it("offers nothing for something that cannot be rented", () => {
    expect(
      rentalDurationsFor({ rentalPricePerDay: null, minimumRentalDays: 1, maximumRentalDays: 30 }),
    ).toEqual([]);
  });
});

describe("quantities", () => {
  it("caps at the stock on hand", () => {
    expect(maxCartQuantity(5)).toBe(5);
    expect(maxCartQuantity(0)).toBe(1);
    expect(maxCartQuantity(500)).toBe(99);
  });

  it("clamps a request into 1..stock, never producing 0", () => {
    expect(clampCartQuantity(0, 5)).toBe(1);
    expect(clampCartQuantity(-4, 5)).toBe(1);
    expect(clampCartQuantity(9, 5)).toBe(5);
    expect(clampCartQuantity(3, 5)).toBe(3);
    expect(clampCartQuantity(2.9, 5)).toBe(2);
  });
});

describe("line issues", () => {
  it("reports the most urgent problem first", () => {
    const item = makePurchaseItem({
      issues: [
        { code: "PRICE_CHANGED", message: "changed" },
        { code: "PRODUCT_UNAVAILABLE", message: "gone" },
        { code: "QUANTITY_UNAVAILABLE", message: "short" },
      ],
    });

    expect(primaryIssue(item)?.code).toBe("PRODUCT_UNAVAILABLE");
  });

  it("reports nothing for a healthy line", () => {
    expect(primaryIssue(makePurchaseItem())).toBeNull();
  });

  it("blocks checkout while any active line has an issue", () => {
    expect(canCheckout([makePurchaseItem(), makeRentalItem()])).toBe(true);

    const broken = makeRentalItem({ issues: [{ code: "PRICE_CHANGED", message: "changed" }] });
    expect(canCheckout([makePurchaseItem(), broken])).toBe(false);
  });

  /* A price change on a parked line is not urgent, but it still has to be seen
     before that line is moved back into the cart. */
  it("ignores issues on saved-for-later lines", () => {
    const parked = makePurchaseItem({
      savedForLater: true,
      issues: [{ code: "PRODUCT_UNAVAILABLE", message: "gone" }],
    });
    expect(canCheckout([makePurchaseItem(), parked])).toBe(true);
  });

  it("treats a retired or deleted product as unavailable", () => {
    expect(
      isUnavailable(
        makePurchaseItem({ issues: [{ code: "PRODUCT_UNAVAILABLE", message: "gone" }] }),
      ),
    ).toBe(true);
    expect(
      isUnavailable(makePurchaseItem({ issues: [{ code: "PRICE_CHANGED", message: "x" }] })),
    ).toBe(false);
    expect(isUnavailable(makePurchaseItem({ product: null }))).toBe(true);
  });
});

describe("labels", () => {
  it("counts items and singularises", () => {
    expect(itemCountLabel(0)).toBe("0 items");
    expect(itemCountLabel(1)).toBe("1 item");
    expect(itemCountLabel(3)).toBe("3 items");
  });

  it("shows the rental arithmetic instead of hiding it", () => {
    const rental = makeRentalItem({ days: 7, quantity: 1 });
    expect(unitPriceLabel(rental)).toBe(`${formatInr(rental.pricing.unitPrice)}/day × 7 days`);
  });

  it("shows a purchase as a flat unit price", () => {
    expect(unitPriceLabel(makePurchaseItem())).toBe(formatInr(2_990_000));
  });

  it("reports the per-unit deposit, never the line total", () => {
    expect(depositLabel(makeRentalItem({ quantity: 3 }))).toBe(formatInr(500_000));
  });

  it("names the two modes", () => {
    expect(modeLabel("RENT")).toBe("Rent");
    expect(modeLabel("BUY")).toBe("Buy");
  });

  it("narrows rentals", () => {
    expect(isRental(makeRentalItem())).toBe(true);
    expect(isRental(makePurchaseItem())).toBe(false);
  });
});

describe("money is never client-authoritative", () => {
  it("derives labels from the server's pricing, not the raw product fields", () => {
    // The product says one daily rate; the server priced the line at another.
    // The line's own pricing must win — it is what the user is charged.
    const item = makeRentalItem({
      product: makeCartProduct({ rentalPricePerDay: 49_900 }),
      days: 7,
      pricing: {
        unitPrice: 42_714,
        rentalCharge: 298_998,
        securityDeposit: 500_000,
        depositTotal: 500_000,
        lineTotal: 798_998,
        days: 7,
      },
    });

    expect(unitPriceLabel(item)).toBe("₹427/day × 7 days");
    expect(item.pricing.lineTotal).toBe(798_998);
  });
});
