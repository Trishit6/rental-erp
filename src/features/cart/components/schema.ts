import { z } from "zod";
import { formatInr } from "@/lib/pricing";
import { CONDITION_LABELS, type ProductCondition } from "@/lib/types";
import type {
  CartItem,
  CartListingType,
  CartTotals,
  CartValidation,
  RentalCartItem,
} from "../types";

/**
 * Cart validation and formatting.
 *
 * Everything here is a pure function or a Zod schema, with no React and no
 * network, so the rules the UI enforces are unit-testable on their own. None of
 * it replaces the server's checks — it exists to stop a bad request from leaving
 * the browser and to explain the server's answer clearly.
 */

/* --------------------------------- inputs ---------------------------------- */

export const cartProductIdSchema = z.coerce.number().int().positive();

/**
 * A cart line is always a concrete BUY or RENT. `RENT_AND_BUY` is a product
 * capability and is rejected here on purpose, so a client can never put an
 * unresolved mode in the cart.
 */
export const cartListingTypeSchema = z.enum(["BUY", "RENT"]);

export const cartQuantitySchema = z.coerce.number().int().min(1).max(99);

/** Matches the product column's own maximum rental window. */
export const cartRentalDurationSchema = z.coerce.number().int().min(1).max(365);

const isoDate = z.string().datetime();

export const addCartItemSchema = z
  .object({
    productId: cartProductIdSchema,
    mode: cartListingTypeSchema,
    quantity: cartQuantitySchema.default(1),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    savedForLater: z.boolean().default(false),
  })
  // A rental without a window is meaningless; a purchase must not carry one.
  .superRefine((input, ctx) => {
    if (input.mode === "RENT" && (!input.startDate || !input.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Rental items need a start and end date.",
      });
    }
    if (input.mode === "BUY" && (input.startDate ?? input.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "A purchase does not carry rental dates.",
      });
    }
  });

export const updateCartItemSchema = z
  .object({
    quantity: cartQuantitySchema.optional(),
    mode: cartListingTypeSchema.optional(),
    startDate: isoDate.nullable().optional(),
    endDate: isoDate.nullable().optional(),
    savedForLater: z.boolean().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to update." });

/** Body of `DELETE /api/cart/items/:id`. */
export const removeCartItemSchema = z.object({ itemId: cartProductIdSchema });

/* -------------------------------- durations -------------------------------- */

/** Preset rental windows, refined later against the product's own limits. */
export const RENTAL_DURATION_OPTIONS = [1, 3, 7, 14, 30] as const;

/**
 * The durations a specific product supports, always including its configured
 * minimum. Empty when the product cannot be rented at all.
 */
export function rentalDurationsFor(product: {
  rentalPricePerDay: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
}): number[] {
  if (!product.rentalPricePerDay) return [];

  const min = Math.max(1, Math.floor(product.minimumRentalDays ?? 1));
  const max = Math.max(min, Math.floor(product.maximumRentalDays ?? 90));

  const options: number[] = RENTAL_DURATION_OPTIONS.filter((days) => days >= min && days <= max);
  if (!options.length) options.push(min);
  if (!options.includes(max)) options.push(max);
  return [...new Set(options)].sort((a, b) => a - b);
}

/** The duration a line should show, falling back to the product's minimum. */
export function resolveRentalDuration(
  item: CartItem,
  product: { minimumRentalDays: number | null } | null,
): number {
  if (item.mode === "RENT" && item.rentalDuration > 0) return item.rentalDuration;
  return Math.max(1, Math.floor(product?.minimumRentalDays ?? 1));
}

/* -------------------------------- quantities ------------------------------- */

/** The largest quantity a line may hold: stock on hand, and never below 1. */
export function maxCartQuantity(availableQuantity: number): number {
  if (!Number.isFinite(availableQuantity)) return 1;
  return Math.max(1, Math.min(99, Math.floor(availableQuantity)));
}

/** Clamp a requested quantity into `[1, max]`. Never returns 0 or a fraction. */
export function clampCartQuantity(value: number, availableQuantity: number): number {
  const max = maxCartQuantity(availableQuantity);
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.floor(value), 1), max);
}

/* --------------------------------- issues ---------------------------------- */

/**
 * Every issue blocks. A price change included: the user agreed to one number, so
 * checkout waits rather than quietly charging a different one. (Acknowledging a
 * new price is a Checkout concern, not something the cart should fake.)
 */

/**
 * Show order for a line with more than one problem: the things that make the line
 * impossible come before the things that merely need attention.
 */
const ISSUE_ORDER: Record<string, number> = {
  PRODUCT_UNAVAILABLE: 0,
  MODE_UNSUPPORTED: 1,
  OWN_LISTING: 2,
  QUANTITY_UNAVAILABLE: 3,
  RENTAL_UNAVAILABLE: 4,
  PRICE_CHANGED: 5,
};

/** The single most urgent issue on a line, or null when the line is fine. */
export function primaryIssue(item: CartItem): CartValidation | null {
  if (!item.issues.length) return null;
  return [...item.issues].sort(
    (a, b) => (ISSUE_ORDER[a.code] ?? 99) - (ISSUE_ORDER[b.code] ?? 99),
  )[0]!;
}

export function canCheckout(items: CartItem[]): boolean {
  return items.filter((item) => !item.savedForLater).every((item) => item.issues.length === 0);
}

/**
 * A line is unavailable when its product is gone or retired. The `product === null`
 * check matters as much as the issue list: a deleted product is rendered from a
 * null join, and it must never be treated as orderable just because a stale
 * cached line has not yet picked up its issue.
 */
export function isUnavailable(item: CartItem): boolean {
  if (!item.product) return true;
  return item.issues.some(
    (issue) => issue.code === "PRODUCT_UNAVAILABLE" || issue.code === "OWN_LISTING",
  );
}

/* ------------------------------ derived totals ----------------------------- */

/** Lines the user intends to act on, in server order. */
export function activeItems(items: CartItem[]): CartItem[] {
  return items.filter((item) => !item.savedForLater);
}

export function savedItems(items: CartItem[]): CartItem[] {
  return items.filter((item) => item.savedForLater);
}

/** "3 items" / "1 item" — the header's own count, from real data. */
export function itemCountLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

/* -------------------------------- formatting -------------------------------- */

/**
 * A rental is priced as "₹499 × 7 days × 2" so the arithmetic is never hidden.
 * A purchase is just "₹24,999 × 1".
 */
export function unitPriceLabel(item: CartItem): string {
  if (item.mode === "RENT") {
    return `${formatInr(item.pricing.unitPrice)}/day × ${item.rentalDuration} ${
      item.rentalDuration === 1 ? "day" : "days"
    }`;
  }
  return formatInr(item.pricing.unitPrice);
}

export function lineTotalLabel(item: CartItem): string {
  return formatInr(item.pricing.lineTotal);
}

export function depositLabel(item: CartItem): string {
  return formatInr(item.pricing.securityDeposit);
}

export function conditionLabel(condition: string): string {
  return CONDITION_LABELS[condition as ProductCondition] ?? condition;
}

/** `listingType` of the *product* → the words the UI uses for the mode. */
export function modeLabel(mode: CartListingType): string {
  return mode === "RENT" ? "Rent" : "Buy";
}

/** The cart's own copy, so the summary never has to hardcode a number. */
export function emptyTotals(): CartTotals {
  return {
    subtotal: 0,
    rentalCharges: 0,
    securityDeposits: 0,
    estimatedTotal: 0,
    itemCount: 0,
    quantityCount: 0,
  };
}

/** Narrowing helper for the discriminated union. */
export function isRental(item: CartItem): item is RentalCartItem {
  return item.mode === "RENT";
}
