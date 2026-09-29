import { describe, expect, it } from "vitest";
import {
  effectiveDailyRate,
  isOverlapping,
  platformFee,
  quotePurchase,
  quoteRental,
  rentalDays,
  rupeesToPaise,
  slugify,
} from "../src/lib/pricing";

describe("money helpers", () => {
  it("converts rupees to paise without float drift", () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });
});

describe("rentalDays", () => {
  it("counts inclusive days", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-03T10:00:00Z");
    expect(rentalDays({ startDate: start, endDate: end })).toBe(2);
  });

  it("returns at least 1 day for same-day rental", () => {
    const time = new Date("2026-01-01T10:00:00Z");
    expect(rentalDays({ startDate: time, endDate: time })).toBe(1);
  });
});

describe("effectiveDailyRate", () => {
  const product = {
    rentalPricePerDay: 10000,
    rentalPricePerWeek: 60000,
    rentalPricePerMonth: 200000,
    securityDeposit: 50000,
  };

  it("uses day rate for short rentals", () => {
    expect(effectiveDailyRate(product, 3)).toBe(10000);
  });

  it("applies weekly tier for 7+ days", () => {
    expect(effectiveDailyRate(product, 7)).toBe(Math.ceil(60000 / 7));
  });

  it("applies monthly tier for 30+ days", () => {
    expect(effectiveDailyRate(product, 30)).toBe(Math.ceil(200000 / 30));
  });
});

describe("quoteRental", () => {
  it("computes subtotal, deposit and total", () => {
    const quote = quoteRental(
      {
        rentalPricePerDay: 10000,
        rentalPricePerWeek: null,
        rentalPricePerMonth: null,
        securityDeposit: 50000,
      },
      {
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-04"),
      },
      4900,
    );
    expect(quote.days).toBe(3);
    expect(quote.rentalSubtotal).toBe(30000);
    expect(quote.securityDeposit).toBe(50000);
    expect(quote.total).toBe(84900);
  });
});

describe("quotePurchase", () => {
  it("multiplies price by quantity", () => {
    expect(quotePurchase(250000, 2, 4900)).toEqual({ subtotal: 500000, total: 504900 });
  });
});

describe("platformFee", () => {
  it("computes percentage in paise", () => {
    expect(platformFee(100000, 10)).toBe(10000);
    expect(platformFee(999, 5)).toBe(50);
  });
});

describe("isOverlapping", () => {
  it("detects overlap", () => {
    expect(
      isOverlapping(
        new Date("2026-01-01"),
        new Date("2026-01-05"),
        new Date("2026-01-04"),
        new Date("2026-01-08"),
      ),
    ).toBe(true);
  });

  it("allows back-to-back rentals", () => {
    expect(
      isOverlapping(
        new Date("2026-01-01"),
        new Date("2026-01-05"),
        new Date("2026-01-05"),
        new Date("2026-01-08"),
      ),
    ).toBe(false);
  });
});

describe("slugify", () => {
  it("slugs product titles", () => {
    expect(slugify("Sony Alpha 7 III — Mirrorless!")).toBe("sony-alpha-7-iii-mirrorless");
  });
});
