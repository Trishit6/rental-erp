import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { products } from "../schema";
import { PUBLIC_PRODUCT_STATUSES } from "./product-status";

/**
 * A legacy row has `NOT_REQUIRED`; every new listing must reach `APPROVED`.
 * Keep this predicate shared so search, detail, seller storefronts and checkout
 * cannot disagree about whether a listing is publishable.
 */
export function publicProductCondition(): SQL {
  return and(
    inArray(products.status, [...PUBLIC_PRODUCT_STATUSES]),
    or(eq(products.verificationStatus, "NOT_REQUIRED"), eq(products.verificationStatus, "APPROVED")),
  )!;
}

export function isVerificationApproved(status: string | null | undefined): boolean {
  return status === "NOT_REQUIRED" || status === "APPROVED";
}
