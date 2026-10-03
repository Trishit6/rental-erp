import { HttpError } from "./api";

/**
 * Cross-field rules for a listing.
 *
 * ## Why these are not in the Zod schema
 *
 * Almost every real rule here is **conditional on another field**: a rental
 * listing needs a rental price and must not carry a purchase price; a rental
 * window needs a minimum below its maximum; available stock cannot exceed total
 * stock. Zod can express that with `superRefine`, and `productInputSchema` is
 * the wrong place for it, because the same schema is reused as
 * `productInputSchema.partial()` for **edits**. A partial edit of
 * `{ listingType: "RENT" }` carries no prices at all — every conditional rule
 * would fire, and a seller renaming a listing could never save it.
 *
 * So the fields are validated by Zod and the *meaning* is validated here, against
 * the merged row: the stored values with the edit applied. That is the only
 * shape in which "a rental listing needs a rental price" is a true statement.
 *
 * Pure functions, no database, so both the create route and the edit route reach
 * the same verdict and a test can assert it without one.
 */

export type ListingType = "SALE" | "RENT" | "BOTH";

export type PricingFacts = {
  listingType: ListingType | string;
  purchasePrice: number | null | undefined;
  rentalPricePerDay: number | null | undefined;
  rentalPricePerWeek: number | null | undefined;
  rentalPricePerMonth: number | null | undefined;
  securityDeposit: number | null | undefined;
  minimumRentalDays: number | null | undefined;
  maximumRentalDays: number | null | undefined;
  quantity: number | null | undefined;
  availableQuantity?: number | null;
};

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** `null` and `undefined` both mean "this field was never set". */
function isBlank(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Everything wrong with a set of pricing facts, in the order a person would
 * explain it. An empty array means the listing is coherent.
 */
export function productPricingIssues(facts: PricingFacts): string[] {
  const issues: string[] = [];

  const sells = facts.listingType === "SALE" || facts.listingType === "BOTH";
  const rents = facts.listingType === "RENT" || facts.listingType === "BOTH";

  const purchasePrice = facts.purchasePrice;
  const rentalPricePerDay = facts.rentalPricePerDay;
  const securityDeposit = facts.securityDeposit;

  if (sells) {
    if (!isMoney(purchasePrice) || purchasePrice <= 0) {
      issues.push("A listing for sale needs a purchase price above zero.");
    }
  } else if (isMoney(purchasePrice) && purchasePrice > 0) {
    issues.push("A rental-only listing cannot carry a purchase price.");
  }

  if (rents) {
    if (!isMoney(rentalPricePerDay) || rentalPricePerDay <= 0) {
      issues.push("A listing for rent needs a daily rental price above zero.");
    }
  } else if (isMoney(rentalPricePerDay) && rentalPricePerDay > 0) {
    issues.push("A sale-only listing cannot carry a rental price.");
  }

  // Optional rates: present-but-negative is the only error. `null` means "no such
  // tier", which is different from "a tier of zero".
  for (const [label, value] of [
    ["weekly", facts.rentalPricePerWeek],
    ["monthly", facts.rentalPricePerMonth],
    ["security deposit", securityDeposit],
  ] as const) {
    if (isMoney(value) && value < 0) {
      issues.push(`The ${label} price cannot be negative.`);
    }
  }

  if (!rents && isMoney(securityDeposit) && securityDeposit > 0) {
    issues.push("A sale-only listing cannot hold a security deposit.");
  }

  const min = facts.minimumRentalDays;
  const max = facts.maximumRentalDays;
  if (isBlank(min) !== isBlank(max)) {
    issues.push("Set both a minimum and a maximum rental duration, or neither.");
  } else if (!isBlank(min) && !isBlank(max)) {
    if (min < 1) issues.push("The minimum rental duration must be at least one day.");
    if (max < min) {
      issues.push("The maximum rental duration must be at least the minimum.");
    }
  }

  if (isMoney(facts.quantity) && isMoney(facts.availableQuantity)) {
    if (facts.availableQuantity > facts.quantity) {
      issues.push("Available stock cannot be more than the total you stock.");
    }
  }

  return issues;
}

/** Throw a 400 naming every problem, or return quietly. */
export function assertProductPricing(facts: PricingFacts): void {
  const issues = productPricingIssues(facts);
  if (issues.length > 0) {
    throw new HttpError(400, "VALIDATION_ERROR", issues.join(" "));
  }
}
