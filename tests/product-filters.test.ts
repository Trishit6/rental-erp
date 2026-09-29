import { describe, expect, it } from "vitest";
import {
  normalizeConditions,
  normalizeLegacyType,
  normalizePriceRange,
  PRODUCT_CONDITIONS,
} from "../server/lib/product-filters";

describe("normalizeConditions", () => {
  it("accepts a single database condition", () => {
    expect(normalizeConditions("GOOD")).toEqual(["GOOD"]);
  });

  it("accepts a comma-separated list", () => {
    expect(normalizeConditions("NEW,GOOD")).toEqual(["NEW", "GOOD"]);
  });

  it("expands pre-loved to every used condition", () => {
    expect(normalizeConditions("pre-loved")).toEqual(["LIKE_NEW", "GOOD", "FAIR", "USED"]);
  });

  it("does not include NEW in pre-loved", () => {
    expect(normalizeConditions("pre-loved")).not.toContain("NEW");
  });

  it("is tolerant of case, spaces and hyphens", () => {
    expect(normalizeConditions("like new")).toEqual(["LIKE_NEW"]);
    expect(normalizeConditions("like-new")).toEqual(["LIKE_NEW"]);
    expect(normalizeConditions("like_new")).toEqual(["LIKE_NEW"]);
  });

  it("drops unknown tokens without failing the whole filter", () => {
    expect(normalizeConditions("GOOD,mint,USED")).toEqual(["GOOD", "USED"]);
  });

  it("returns nothing for empty or missing input", () => {
    expect(normalizeConditions()).toEqual([]);
    expect(normalizeConditions("")).toEqual([]);
    expect(normalizeConditions(" , ")).toEqual([]);
  });

  it("never invents a condition outside the database enum", () => {
    for (const condition of normalizeConditions("pre-loved,NEW,GOOD")) {
      expect(PRODUCT_CONDITIONS).toContain(condition);
    }
  });
});

describe("normalizeLegacyType", () => {
  it("maps the legacy enum onto browse modes", () => {
    expect(normalizeLegacyType("RENT")).toBe("rent");
    expect(normalizeLegacyType("SALE")).toBe("buy");
    expect(normalizeLegacyType("BOTH")).toBe("rent-and-buy");
  });

  it("returns undefined when absent", () => {
    expect(normalizeLegacyType(undefined)).toBeUndefined();
  });
});

describe("normalizePriceRange", () => {
  it("leaves a valid range alone", () => {
    expect(normalizePriceRange(100, 500)).toEqual({ minPrice: 100, maxPrice: 500 });
  });

  it("swaps a reversed range", () => {
    expect(normalizePriceRange(500, 100)).toEqual({ minPrice: 100, maxPrice: 500 });
  });

  it("passes through a single bound", () => {
    expect(normalizePriceRange(100, undefined)).toEqual({ minPrice: 100, maxPrice: undefined });
    expect(normalizePriceRange(undefined, 500)).toEqual({ minPrice: undefined, maxPrice: 500 });
  });

  it("keeps an equal range", () => {
    expect(normalizePriceRange(250, 250)).toEqual({ minPrice: 250, maxPrice: 250 });
  });
});
