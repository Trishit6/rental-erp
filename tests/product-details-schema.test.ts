import { describe, expect, it } from "vitest";
import {
  buildCartPayload,
  buildRentalOptions,
  clampQuantity,
  clampRentalDays,
  conditionLabel,
  findRentalOption,
  headerRatingSummary,
  isRentalDurationValid,
  listingTypeLabel,
  maxQuantityFor,
  productActions,
  productIdSchema,
  productSpecifications,
  rentalWindow,
  resolveListingMode,
  resolveRentalDays,
  stockState,
  supportedModes,
} from "@/features/product-details/components/schema";
import { makeProduct } from "./support/product-fixtures";

const FROM = new Date("2026-02-01T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("supportedModes", () => {
  it("offers only rent for a rent-only listing", () => {
    expect(supportedModes({ rentalPricePerDay: 1000, purchasePrice: null })).toEqual(["RENT"]);
  });

  it("offers only buy for a sale-only listing", () => {
    expect(supportedModes({ rentalPricePerDay: null, purchasePrice: 5000 })).toEqual(["BUY"]);
  });

  it("offers all three modes for a rent-and-buy listing", () => {
    expect(supportedModes({ rentalPricePerDay: 1000, purchasePrice: 5000 })).toEqual([
      "RENT",
      "BUY",
      "RENT_AND_BUY",
    ]);
  });

  it("offers nothing when the listing publishes no price", () => {
    expect(supportedModes({ rentalPricePerDay: null, purchasePrice: null })).toEqual([]);
  });

  it("treats a zero price as unsupported", () => {
    expect(supportedModes({ rentalPricePerDay: 0, purchasePrice: 0 })).toEqual([]);
  });
});

describe("resolveListingMode", () => {
  it("keeps a selection the product still supports", () => {
    expect(resolveListingMode({ rentalPricePerDay: 1000, purchasePrice: 5000 }, "BUY")).toBe("BUY");
  });

  it("falls back to the first supported mode when the selection is stale", () => {
    expect(resolveListingMode({ rentalPricePerDay: 1000, purchasePrice: null }, "BUY")).toBe(
      "RENT",
    );
  });

  it("returns null when there is no mode to offer", () => {
    expect(resolveListingMode({ rentalPricePerDay: null, purchasePrice: null }, "RENT")).toBeNull();
  });
});

describe("buildRentalOptions", () => {
  it("offers the presets that fit the product's own window", () => {
    const options = buildRentalOptions({ minimumRentalDays: 1, maximumRentalDays: 30 }, FROM);
    expect(options.map((option) => option.days)).toEqual([1, 3, 7, 14, 30]);
  });

  it("drops presets outside a narrow window", () => {
    const options = buildRentalOptions({ minimumRentalDays: 5, maximumRentalDays: 10 }, FROM);
    expect(options.map((option) => option.days)).toEqual([7]);
  });

  it("falls back to the minimum when no preset fits", () => {
    const options = buildRentalOptions({ minimumRentalDays: 40, maximumRentalDays: 90 }, FROM);
    expect(options.map((option) => option.days)).toEqual([40]);
  });

  it("labels each option and maps it to exact day-aligned dates", () => {
    const options = buildRentalOptions({ minimumRentalDays: 1, maximumRentalDays: 30 }, FROM);
    expect(options[0].label).toBe("1 day");
    expect(options[1].label).toBe("3 days");

    for (const option of options) {
      const span = new Date(option.endDate).getTime() - new Date(option.startDate).getTime();
      expect(span).toBe(option.days * DAY_MS);
      expect(option.startDate).toBe(FROM.toISOString());
    }
  });
});

describe("rentalWindow and clampRentalDays", () => {
  it("never returns a window narrower than one day", () => {
    expect(rentalWindow({ minimumRentalDays: null, maximumRentalDays: null })).toEqual({
      min: 1,
      max: 90,
    });
    expect(rentalWindow({ minimumRentalDays: 10, maximumRentalDays: 2 })).toEqual({
      min: 10,
      max: 10,
    });
  });

  it("clamps a duration into the window", () => {
    const product = { minimumRentalDays: 3, maximumRentalDays: 14 };
    expect(clampRentalDays(1, product)).toBe(3);
    expect(clampRentalDays(30, product)).toBe(14);
    expect(clampRentalDays(7, product)).toBe(7);
  });

  it("falls back to the minimum for a non-numeric duration", () => {
    expect(clampRentalDays(Number.NaN, { minimumRentalDays: 5, maximumRentalDays: 20 })).toBe(5);
  });
});

describe("resolveRentalDays and findRentalOption", () => {
  const options = buildRentalOptions({ minimumRentalDays: 1, maximumRentalDays: 30 }, FROM);

  it("keeps a still-valid selection", () => {
    expect(resolveRentalDays(options, 7)).toBe(7);
  });

  it("falls back to the first option when the selection is gone", () => {
    expect(resolveRentalDays(options, 365)).toBe(1);
  });

  it("returns null when there are no options at all", () => {
    expect(resolveRentalDays([], 3)).toBeNull();
    expect(findRentalOption([], 3)).toBeNull();
  });

  it("finds the matching option", () => {
    expect(findRentalOption(options, 14)?.days).toBe(14);
  });
});

describe("isRentalDurationValid", () => {
  const product = { minimumRentalDays: 3, maximumRentalDays: 14 };

  it("accepts durations inside the window and rejects the rest", () => {
    expect(isRentalDurationValid(7, product)).toBe(true);
    expect(isRentalDurationValid(2, product)).toBe(false);
    expect(isRentalDurationValid(20, product)).toBe(false);
    expect(isRentalDurationValid(3.5, product)).toBe(false);
  });
});

describe("maxQuantityFor and clampQuantity", () => {
  it("keeps the maximum at least one and at most 99", () => {
    expect(maxQuantityFor(0)).toBe(1);
    expect(maxQuantityFor(5)).toBe(5);
    expect(maxQuantityFor(200)).toBe(99);
  });

  it("clamps a quantity into range", () => {
    expect(clampQuantity(0, 3)).toBe(1);
    expect(clampQuantity(50, 3)).toBe(3);
    expect(clampQuantity(2.9, 3)).toBe(2);
  });
});

describe("stockState", () => {
  it("reports an inactive listing as unavailable", () => {
    expect(stockState({ status: "PAUSED" }, 10)).toBe("UNAVAILABLE");
  });

  it("maps unit counts to stock states", () => {
    expect(stockState({ status: "PUBLISHED" }, 0)).toBe("OUT_OF_STOCK");
    expect(stockState({ status: "PUBLISHED" }, 2)).toBe("LIMITED");
    expect(stockState({ status: "PUBLISHED" }, 5)).toBe("AVAILABLE");
  });
});

describe("productActions", () => {
  it("offers nothing when the item cannot be ordered", () => {
    expect(productActions("BUY", false)).toEqual([]);
  });

  it("offers a cart and a checkout path for a sale", () => {
    const actions = productActions("BUY", true);
    expect(actions.map((action) => [action.id, action.intent])).toEqual([
      ["add-to-cart", "cart"],
      ["buy-now", "checkout"],
    ]);
    expect(actions.every((action) => action.cartMode === "BUY")).toBe(true);
  });

  it("offers a rental cart and rent-now path for a rental", () => {
    const actions = productActions("RENT", true);
    expect(actions.map((action) => [action.id, action.intent])).toEqual([
      ["add-rental-to-cart", "cart"],
      ["rent-now", "checkout"],
    ]);
    expect(actions.every((action) => action.cartMode === "RENT")).toBe(true);
  });

  it("pairs a purchase cart with an immediate rental for rent-and-buy", () => {
    const actions = productActions("RENT_AND_BUY", true);
    expect(actions.map((action) => [action.label, action.cartMode])).toEqual([
      ["Add to cart", "BUY"],
      ["Rent now", "RENT"],
    ]);
  });
});

describe("buildCartPayload", () => {
  const product = makeProduct();
  const buyAction = productActions("BUY", true)[0];
  const rentAction = productActions("RENT", true)[0];
  const rentalOption = buildRentalOptions(product, FROM)[0];

  it("builds a purchase payload", () => {
    expect(
      buildCartPayload({
        action: buyAction,
        productId: product.id,
        quantity: 2,
        rentalOption: null,
      }),
    ).toEqual({ productId: product.id, mode: "BUY", quantity: 2 });
  });

  it("carries the rental window with a rental payload", () => {
    const payload = buildCartPayload({
      action: rentAction,
      productId: product.id,
      quantity: 1,
      rentalOption,
    });
    expect(payload).toMatchObject({
      productId: product.id,
      mode: "RENT",
      quantity: 1,
      startDate: rentalOption.startDate,
      endDate: rentalOption.endDate,
    });
  });

  it("refuses a rental with no dates instead of sending it", () => {
    expect(
      buildCartPayload({
        action: rentAction,
        productId: product.id,
        quantity: 1,
        rentalOption: null,
      }),
    ).toBeNull();
  });

  it("refuses an out-of-range quantity", () => {
    expect(
      buildCartPayload({
        action: buyAction,
        productId: product.id,
        quantity: 0,
        rentalOption: null,
      }),
    ).toBeNull();
  });
});

describe("productSpecifications", () => {
  it("includes the brand only when the backend returned one", () => {
    const withBrand = productSpecifications(makeProduct({ brand: "Sony" }));
    expect(withBrand).toContainEqual({ label: "Brand", value: "Sony" });

    const withoutBrand = productSpecifications(makeProduct({ brand: null }));
    expect(withoutBrand.some((row) => row.label === "Brand")).toBe(false);
  });

  it("adds rental rows only for a rentable listing", () => {
    const rentable = productSpecifications(makeProduct());
    expect(rentable.some((row) => row.label === "Minimum rental")).toBe(true);
    expect(rentable).toContainEqual({ label: "Security deposit", value: "₹5,000" });

    const saleOnly = productSpecifications(
      makeProduct({
        rentalPricePerDay: null,
        listingType: "SALE",
        minimumRentalDays: null,
        maximumRentalDays: null,
        securityDeposit: null,
      }),
    );
    expect(saleOnly.some((row) => row.label === "Minimum rental")).toBe(false);
    expect(saleOnly.some((row) => row.label === "Security deposit")).toBe(false);
  });

  it("always describes the listing itself", () => {
    const rows = productSpecifications(makeProduct());
    expect(rows).toContainEqual({ label: "Category", value: "Audio" });
    expect(rows).toContainEqual({ label: "Condition", value: "Like new" });
    expect(rows).toContainEqual({ label: "Listing type", value: "Rent + buy" });
    expect(rows).toContainEqual({ label: "Units available", value: "5" });
  });
});

describe("headerRatingSummary", () => {
  it("reads the stored rating straight off the product row", () => {
    // The full aggregate — average, count *and* the five-bucket distribution — is
    // computed in SQL by the server and arrives with the review list. This helper
    // only supplies the one-line figure beside the title, so it has no reviews
    // argument at all: deriving it from loaded rows is the mistake being prevented.
    const summary = headerRatingSummary(makeProduct({ ratingAverage: 4.8, ratingCount: 128 }));
    expect(summary).toEqual({ average: 4.8, count: 128 });
  });

  it("reports nothing for a product with no reviews", () => {
    expect(headerRatingSummary(makeProduct({ ratingAverage: 0, ratingCount: 0 }))).toEqual({
      average: 0,
      count: 0,
    });
  });

  it("does not show an average of 0 as if it were a real rating", () => {
    // A listing nobody has reviewed can carry a stale non-zero `ratingAverage` if
    // every review was moderated; zeroing it keeps "No reviews yet" honest rather
    // than printing "0.0" beside the title.
    const summary = headerRatingSummary(makeProduct({ ratingAverage: 3.2, ratingCount: 0 }));
    expect(summary.average).toBe(0);
    expect(summary.count).toBe(0);
  });
});

describe("labels", () => {
  it("humanises the database vocabulary and passes unknown values through", () => {
    expect(conditionLabel("LIKE_NEW")).toBe("Like new");
    expect(conditionLabel("MINT")).toBe("MINT");
    expect(listingTypeLabel("BOTH")).toBe("Rent + buy");
    expect(listingTypeLabel("SWAP")).toBe("SWAP");
  });
});

describe("productIdSchema", () => {
  it("accepts a slug or a numeric id", () => {
    expect(productIdSchema.safeParse("sony-wh-1000xm5").success).toBe(true);
    expect(productIdSchema.safeParse("42").success).toBe(true);
  });

  it("rejects blank, spaced or punctuated references", () => {
    expect(productIdSchema.safeParse("").success).toBe(false);
    expect(productIdSchema.safeParse("two words").success).toBe(false);
    expect(productIdSchema.safeParse("-leading-dash").success).toBe(false);
    expect(productIdSchema.safeParse("a/b").success).toBe(false);
  });
});
