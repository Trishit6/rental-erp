import { describe, expect, it } from "vitest";
import {
  activeRentalFilterCount,
  extensionRequestSchema,
  hasActiveRentalFilters,
  MAX_EXTENSION_DAYS,
  parseRentalRouteParam,
  parseRentalsSearch,
  returnRequestSchema,
} from "@/features/rentals/components/schema";
import { depositStatusLabel, rentalStatusLabel } from "@/features/rentals/types";

describe("parsing the rentals URL", () => {
  it("returns an empty object for no params", () => {
    expect(parseRentalsSearch({})).toEqual({});
    expect(parseRentalsSearch(undefined)).toEqual({});
  });

  it("accepts a page as a number or a numeric string", () => {
    // The router JSON-parses search params, so both shapes are real.
    expect(parseRentalsSearch({ page: 3 }).page).toBe(3);
    expect(parseRentalsSearch({ page: "3" }).page).toBe(3);
  });

  it("never throws and drops invalid values", () => {
    for (const input of [
      { page: "abc" },
      { page: 0 },
      { status: "MELTED" },
      { bucket: "sideways" },
      { sort: "by_vibes" },
      { from: "nonsense" },
    ]) {
      expect(() => parseRentalsSearch(input)).not.toThrow();
    }
    expect(parseRentalsSearch({ status: "MELTED" }).status).toBeUndefined();
    expect(parseRentalsSearch({ bucket: "sideways" }).bucket).toBeUndefined();
  });

  it("keeps the known buckets, statuses and sorts", () => {
    expect(parseRentalsSearch({ bucket: "active" }).bucket).toBe("active");
    expect(parseRentalsSearch({ status: "RETURN_PENDING" }).status).toBe("RETURN_PENDING");
    expect(parseRentalsSearch({ sort: "ending_soon" }).sort).toBe("ending_soon");
  });

  it("trims a search and drops an empty one", () => {
    expect(parseRentalsSearch({ search: "  camera  " }).search).toBe("camera");
    expect(parseRentalsSearch({ search: "   " }).search).toBeUndefined();
  });

  it("bounds the search length", () => {
    expect(parseRentalsSearch({ search: "x".repeat(500) }).search).toHaveLength(120);
  });
});

describe("route param parsing", () => {
  it("normalises a positive integer to a number", () => {
    // A number, not the raw string, so `"61"` and `61` can never drift apart in
    // a comparison or a cache key.
    expect(parseRentalRouteParam("61")).toBe(61);
    expect(parseRentalRouteParam(61)).toBe(61);
    expect(typeof parseRentalRouteParam("61")).toBe("number");
  });

  it("rejects anything that cannot identify a rental", () => {
    for (const value of ["", "   ", "abc", "0", "-1", "1.5", null, undefined, {}]) {
      expect(parseRentalRouteParam(value)).toBeNull();
    }
  });
});

describe("filter presence", () => {
  it("knows when nothing is narrowing the list", () => {
    expect(hasActiveRentalFilters({})).toBe(false);
    expect(hasActiveRentalFilters({ sort: "oldest" })).toBe(false);
    expect(hasActiveRentalFilters({ bucket: "active" })).toBe(true);
    expect(activeRentalFilterCount({ search: "x", bucket: "active" })).toBe(2);
  });
});

describe("the extension request is the only thing a client may send", () => {
  it("accepts a sane number of days", () => {
    expect(extensionRequestSchema.safeParse({ additionalDays: 3 }).success).toBe(true);
    expect(extensionRequestSchema.safeParse({ additionalDays: 1 }).success).toBe(true);
    expect(extensionRequestSchema.safeParse({ additionalDays: MAX_EXTENSION_DAYS }).success).toBe(
      true,
    );
  });

  it("rejects fractions, zero and absurd lengths", () => {
    expect(extensionRequestSchema.safeParse({ additionalDays: 0 }).success).toBe(false);
    expect(extensionRequestSchema.safeParse({ additionalDays: -1 }).success).toBe(false);
    expect(extensionRequestSchema.safeParse({ additionalDays: 1.5 }).success).toBe(false);
    expect(extensionRequestSchema.safeParse({ additionalDays: 9999 }).success).toBe(false);
  });

  it("rejects any financial or date field the client tries to assert", () => {
    // This is the security property: a body carrying these must fail loudly
    // rather than appear to be accepted and quietly ignored.
    for (const body of [
      { additionalDays: 3, totalPrice: 1 },
      { additionalDays: 3, newEndDate: "2026-10-09" },
      { additionalDays: 3, securityDeposit: 0 },
      { additionalDays: 3, additionalCost: 0 },
      { additionalDays: 3, status: "APPROVED" },
    ]) {
      expect(extensionRequestSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe("the return request", () => {
  it("accepts only the two known methods and defaults to drop-off", () => {
    expect(returnRequestSchema.parse({}).method).toBe("DROP_OFF");
    expect(returnRequestSchema.safeParse({ method: "PICKUP" }).success).toBe(true);
    expect(returnRequestSchema.safeParse({ method: "TELEPORT" }).success).toBe(false);
  });

  it("rejects anything it does not understand", () => {
    expect(returnRequestSchema.safeParse({ method: "DROP_OFF", refund: 5000 }).success).toBe(false);
  });
});

describe("labels", () => {
  it("names the states a customer acts on", () => {
    expect(rentalStatusLabel("RETURN_PENDING")).toBe("Return requested");
    expect(rentalStatusLabel("CONFIRMED")).toBe("Confirmed");
    expect(rentalStatusLabel("OVERDUE")).toBe("Overdue");
  });

  it("renders an unknown status as words rather than blank", () => {
    expect(rentalStatusLabel("INSPECTION")).toBe("Inspection");
  });

  it("names the deposit states", () => {
    expect(depositStatusLabel("HELD")).toBe("Held");
    expect(depositStatusLabel("RELEASE_PENDING")).toBe("Release pending");
    expect(depositStatusLabel(null)).toBe("None");
  });
});
