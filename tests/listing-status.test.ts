import { describe, expect, it } from "vitest";
import {
  PUBLIC_PRODUCT_STATUSES,
  PRODUCT_STATUSES,
  SELLER_SETTABLE_STATUSES,
} from "../src/lib/types";
import {
  isProductStatus,
  isPubliclyVisible,
  isPurchasable,
  PRODUCT_STATUSES as SERVER_PRODUCT_STATUSES,
  PUBLIC_PRODUCT_STATUSES as SERVER_PUBLIC_PRODUCT_STATUSES,
  SELLER_SETTABLE_STATUSES as SERVER_SELLER_SETTABLE_STATUSES,
} from "../server/lib/product-status";

/**
 * The listing-lifecycle vocabulary is deliberately declared twice — once for the
 * client (`src/lib/types.ts`) and once for the server (`server/lib/product-status.ts`)
 * — for the same reason the product filter vocabulary is: `src/lib/pricing.ts` is
 * the only `src/` file in the server tsconfig, and widening that is a bigger
 * change than a test. The test is what keeps the duplication honest.
 */
describe("listing status vocabulary is identical on both sides of the wire", () => {
  it("lists the same statuses, in the same order", () => {
    expect([...SERVER_PRODUCT_STATUSES]).toEqual([...PRODUCT_STATUSES]);
  });

  it("agrees on which statuses a seller may set by hand", () => {
    expect([...SERVER_SELLER_SETTABLE_STATUSES]).toEqual([...SELLER_SETTABLE_STATUSES]);
  });

  it("agrees on which statuses are publicly visible", () => {
    expect([...SERVER_PUBLIC_PRODUCT_STATUSES]).toEqual([...PUBLIC_PRODUCT_STATUSES]);
  });
});

describe("public visibility is not the same question as purchasability", () => {
  it("keeps a sold-out listing visible", () => {
    // The whole point of `OUT_OF_STOCK`: a listing that ran out is still a
    // listing, so it must not vanish from Browse along with its favourites.
    expect(isPubliclyVisible("OUT_OF_STOCK")).toBe(true);
    expect(isPurchasable("OUT_OF_STOCK")).toBe(false);
  });

  it("hides everything a seller has withdrawn", () => {
    for (const status of ["DRAFT", "PAUSED", "ARCHIVED"] as const) {
      expect(isPubliclyVisible(status)).toBe(false);
      expect(isPurchasable(status)).toBe(false);
    }
  });

  it("treats a published listing as both visible and purchasable", () => {
    expect(isPubliclyVisible("PUBLISHED")).toBe(true);
    expect(isPurchasable("PUBLISHED")).toBe(true);
  });

  it("refuses an unknown or absent status rather than guessing", () => {
    expect(isPubliclyVisible("ACTIVE")).toBe(false);
    expect(isPubliclyVisible(null)).toBe(false);
    expect(isPubliclyVisible(undefined)).toBe(false);
    expect(isPurchasable("SOLD")).toBe(false);
  });
});

describe("isProductStatus", () => {
  it("accepts only real statuses", () => {
    for (const status of PRODUCT_STATUSES) expect(isProductStatus(status)).toBe(true);
    expect(isProductStatus("ACTIVE")).toBe(false);
    expect(isProductStatus("")).toBe(false);
    expect(isProductStatus(3)).toBe(false);
    expect(isProductStatus(null)).toBe(false);
  });
});
