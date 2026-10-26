import { readCheckoutExtra } from "./payments/checkout-context";

/**
 * Extension pricing and approval lifetime, as pure functions.
 *
 * ## Why the charge is `new − old`, not `days × rate`
 *
 * Extra days are not a separate booking: they lengthen the one already in
 * progress. The rate for a longer rental may be cheaper (a week or month tier),
 * so charging `additionalDays × currentRate` would overcharge a customer whose
 * extension pushes them into a better tier. Recomputing both totals at the rate
 * each length qualifies for and charging the difference is the only formula that
 * is never dearer than booking the longer window up front.
 *
 * ## Why an approval expires
 *
 * Approving an extension *offers* the renter extra time at a price. If the offer
 * is never paid, the item cannot stay reserved forever — the next booking needs a
 * decision. `EXTENSION_APPROVAL_TTL_MS` is that window, and the sweep that
 * enforces it lives in `rental-payments.ts`.
 */

/** How long an approved-but-unpaid extension holds before it lapses. */
export const EXTENSION_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The extra charge for extending from `currentDays` to `newDays`.
 *
 * Both sides are priced at the effective rate for their own length, and the
 * difference is floored at zero — an extension that happens to be cheaper returns
 * nothing owed rather than a negative charge (a credit is not what was asked for).
 */
export function extensionCharge(input: {
  oldRate: number;
  newRate: number;
  currentDays: number;
  newDays: number;
}): number {
  const oldTotal = Math.max(0, input.oldRate) * Math.max(0, input.currentDays);
  const newTotal = Math.max(0, input.newRate) * Math.max(0, input.newDays);
  return Math.max(0, Math.round(newTotal - oldTotal));
}

/**
 * Tax on the extension charge, from the platform's rate (PROMPT R7).
 *
 * Returns zero when no rate is configured rather than inventing one — a tax that
 * was never agreed is worse than no tax line.
 */
export function extensionTax(charge: number, taxPercent?: number | null): number {
  const percent = typeof taxPercent === "number" ? taxPercent : 0;
  if (!Number.isFinite(percent) || percent <= 0 || charge <= 0) return 0;
  return Math.round((charge * percent) / 100);
}

/** When an approval made at `approvedAt` stops holding. */
export function extensionApprovalExpiry(approvedAt: Date): Date {
  return new Date(approvedAt.getTime() + EXTENSION_APPROVAL_TTL_MS);
}

/** Whether an approval has lapsed. A missing approval is not "expired". */
export function isExtensionApprovalExpired(
  approvedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!approvedAt) return false;
  return now.getTime() >= extensionApprovalExpiry(approvedAt).getTime();
}

/**
 * What an approved extension intends to do, stored on the payment that pays for
 * it. The settlement path reads this back and applies it only if the rental still
 * looks exactly as it did when the plan was written — which is why the previous
 * end date is part of the plan.
 */
export type ExtensionPlan = {
  additionalDays: number;
  /** The end date at approval time, so a meanwhile-changed rental is refused. */
  previousEndDate: string;
  newEndDate: string;
  /** Rent difference in paise. */
  charge: number;
  /** Tax on the difference, when a rate is configured. */
  tax: number;
  total: number;
  currency: string;
};

/** The key `serializeCheckoutMetadata` stores the plan under. */
export const EXTENSION_PLAN_KEY = "extension";

export function readExtensionPlan(metadata: string | null): ExtensionPlan | null {
  const raw = readCheckoutExtra(metadata, EXTENSION_PLAN_KEY);
  if (typeof raw !== "object" || raw === null) return null;
  const plan = raw as Record<string, unknown>;
  if (
    typeof plan.additionalDays !== "number" ||
    typeof plan.previousEndDate !== "string" ||
    typeof plan.newEndDate !== "string" ||
    typeof plan.charge !== "number" ||
    typeof plan.total !== "number"
  ) {
    return null;
  }
  return {
    additionalDays: plan.additionalDays,
    previousEndDate: plan.previousEndDate,
    newEndDate: plan.newEndDate,
    charge: plan.charge,
    tax: typeof plan.tax === "number" ? plan.tax : 0,
    total: plan.total,
    currency: typeof plan.currency === "string" ? plan.currency : "INR",
  };
}
