import { z } from "zod";
import { format } from "date-fns";
import { formatInr } from "@/lib/pricing";
import {
  CONDITION_LABELS,
  isPubliclyVisible,
  LISTING_MODE_LABELS,
  type ReviewItem,
} from "@/lib/types";
import type {
  AddToCartInput,
  ListingMode,
  ProductAction,
  ProductDetails,
  ProductReviewSummary,
  ProductSpecification,
  RentalOption,
  StockState,
} from "../types";

/* --------------------------------- inputs ---------------------------------- */

/**
 * A product reference is either a numeric id or a slug. Constrained hard because
 * it reaches the backend straight from the URL.
 */
export const productIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Invalid product reference");

export const listingModeSchema = z.enum(["RENT", "BUY", "RENT_AND_BUY"]);
export const cartModeSchema = z.enum(["RENT", "BUY"]);

/** Rental duration, before the product's own min/max window is applied. */
export const rentalDurationSchema = z.number().int().min(1).max(365);

export const quantitySchema = z.number().int().min(1).max(99);

/**
 * The backend re-validates all of this (`/cart/items`); this only stops a bad
 * request from ever leaving the browser.
 */
export const addToCartPayloadSchema = z
  .object({
    productId: z.number().int().positive(),
    mode: cartModeSchema,
    quantity: quantitySchema,
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .refine((payload) => payload.mode !== "RENT" || (!!payload.startDate && !!payload.endDate), {
    message: "Rental dates are required.",
    path: ["startDate"],
  });

/* ------------------------------- rental window ------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;
const RENTAL_PRESET_DAYS = [1, 3, 7, 14, 30];

/** Concrete dates for a duration. Exact multiples of a day, so `rentalDays` round-trips. */
export function withRentalDates(
  days: number,
  from: Date = new Date(),
): { startDate: string; endDate: string } {
  const start = new Date(from);
  const end = new Date(start.getTime() + days * DAY_MS);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/**
 * Durations offered for this product: the presets that fit its own min/max
 * window, or — if none fit — the window's minimum so there is always a choice.
 */
export function buildRentalOptions(
  product: Pick<ProductDetails, "minimumRentalDays" | "maximumRentalDays">,
  from: Date = new Date(),
): RentalOption[] {
  const min = Math.max(1, Math.floor(product.minimumRentalDays ?? 1));
  const max = Math.max(min, Math.floor(product.maximumRentalDays ?? 90));

  let days = RENTAL_PRESET_DAYS.filter((day) => day >= min && day <= max);
  if (days.length === 0) days = [min];

  return days.map((day) => ({
    days: day,
    label: day === 1 ? "1 day" : `${day} days`,
    ...withRentalDates(day, from),
  }));
}

export function rentalWindow(
  product: Pick<ProductDetails, "minimumRentalDays" | "maximumRentalDays">,
): { min: number; max: number } {
  const min = Math.max(1, Math.floor(product.minimumRentalDays ?? 1));
  return { min, max: Math.max(min, Math.floor(product.maximumRentalDays ?? 90)) };
}

export function isRentalDurationValid(
  days: number,
  product: Pick<ProductDetails, "minimumRentalDays" | "maximumRentalDays">,
): boolean {
  if (!rentalDurationSchema.safeParse(days).success) return false;
  const { min, max } = rentalWindow(product);
  return days >= min && days <= max;
}

/** Keep a requested duration inside the product's window. */
export function clampRentalDays(
  days: number,
  product: Pick<ProductDetails, "minimumRentalDays" | "maximumRentalDays">,
): number {
  const { min, max } = rentalWindow(product);
  if (!Number.isFinite(days)) return min;
  return Math.min(Math.max(Math.floor(days), min), max);
}

/**
 * The duration actually in effect: the visitor's pick when it is still valid for
 * this product, otherwise the first offered option.
 */
export function resolveRentalDays(options: RentalOption[], selected: number | null): number | null {
  if (selected !== null && options.some((option) => option.days === selected)) return selected;
  return options[0]?.days ?? null;
}

export function findRentalOption(
  options: RentalOption[],
  days: number | null,
): RentalOption | null {
  if (days === null) return null;
  return options.find((option) => option.days === days) ?? null;
}

/* --------------------------------- modes ----------------------------------- */

export function isRentable(product: Pick<ProductDetails, "rentalPricePerDay">): boolean {
  return product.rentalPricePerDay !== null && product.rentalPricePerDay > 0;
}

export function isBuyable(product: Pick<ProductDetails, "purchasePrice">): boolean {
  return product.purchasePrice !== null && product.purchasePrice > 0;
}

/** Only the modes this product actually supports, in display order. */
export function supportedModes(
  product: Pick<ProductDetails, "rentalPricePerDay" | "purchasePrice">,
): ListingMode[] {
  const rentable = isRentable(product);
  const buyable = isBuyable(product);
  const modes: ListingMode[] = [];
  if (rentable) modes.push("RENT");
  if (buyable) modes.push("BUY");
  if (rentable && buyable) modes.push("RENT_AND_BUY");
  return modes;
}

/** Guard against a mode that is no longer valid (e.g. after a cache refresh). */
export function resolveListingMode(
  product: Pick<ProductDetails, "rentalPricePerDay" | "purchasePrice">,
  selected: ListingMode | null,
): ListingMode | null {
  const modes = supportedModes(product);
  if (modes.length === 0) return null;
  if (selected && modes.includes(selected)) return selected;
  return modes[0];
}

/* ------------------------------- quantities -------------------------------- */

export function maxQuantityFor(availableQuantity: number): number {
  if (!Number.isFinite(availableQuantity)) return 1;
  return Math.max(1, Math.min(99, Math.floor(availableQuantity)));
}

export function clampQuantity(value: number, availableQuantity: number): number {
  const max = maxQuantityFor(availableQuantity);
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.floor(value), 1), max);
}

/* ------------------------------ availability ------------------------------- */

export function stockState(
  product: Pick<ProductDetails, "status">,
  availableUnits: number,
): StockState {
  // Withdrawn (draft/paused/archived) is a different answer from sold out, and
  // the two must not collapse into one message: "unavailable" would be wrong for
  // a listing the seller is about to restock.
  if (!isPubliclyVisible(product.status)) return "UNAVAILABLE";
  if (product.status === "OUT_OF_STOCK") return "OUT_OF_STOCK";
  if (availableUnits <= 0) return "OUT_OF_STOCK";
  if (availableUnits <= 2) return "LIMITED";
  return "AVAILABLE";
}

/* -------------------------------- actions ---------------------------------- */

/**
 * Buttons for a listing mode. A rent-and-buy listing offers the purchase path
 * through the cart and the rental path as an immediate checkout.
 */
export function productActions(mode: ListingMode, available: boolean): ProductAction[] {
  if (!available) return [];

  if (mode === "BUY") {
    return [
      { id: "add-to-cart", label: "Add to cart", cartMode: "BUY", tone: "primary", intent: "cart" },
      { id: "buy-now", label: "Buy now", cartMode: "BUY", tone: "secondary", intent: "checkout" },
    ];
  }
  if (mode === "RENT") {
    return [
      {
        id: "add-rental-to-cart",
        label: "Add rental to cart",
        cartMode: "RENT",
        tone: "primary",
        intent: "cart",
      },
      {
        id: "rent-now",
        label: "Rent now",
        cartMode: "RENT",
        tone: "secondary",
        intent: "checkout",
      },
    ];
  }
  return [
    { id: "add-to-cart", label: "Add to cart", cartMode: "BUY", tone: "primary", intent: "cart" },
    { id: "rent-now", label: "Rent now", cartMode: "RENT", tone: "secondary", intent: "checkout" },
  ];
}

/**
 * The exact body `POST /api/cart/items` receives. Returns null when the request
 * would be invalid (a rental without dates), so callers surface it instead of
 * sending it.
 */
export function buildCartPayload(input: {
  action: ProductAction;
  productId: number;
  quantity: number;
  rentalOption: RentalOption | null;
}): AddToCartInput | null {
  const { action, productId, quantity, rentalOption } = input;

  const candidate: AddToCartInput =
    action.cartMode === "RENT"
      ? {
          productId,
          mode: "RENT",
          quantity,
          startDate: rentalOption?.startDate,
          endDate: rentalOption?.endDate,
        }
      : { productId, mode: "BUY", quantity };

  const parsed = addToCartPayloadSchema.safeParse(candidate);
  return parsed.success ? candidate : null;
}

/* -------------------------------- content ---------------------------------- */

export function conditionLabel(condition: string): string {
  return CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS] ?? condition;
}

export function listingTypeLabel(listingType: string): string {
  return LISTING_MODE_LABELS[listingType] ?? listingType;
}

/**
 * Specification rows built only from fields the backend returned — nothing is
 * invented, and empty fields are dropped rather than shown as blanks.
 */
export function productSpecifications(product: ProductDetails): ProductSpecification[] {
  const rows: ProductSpecification[] = [];

  if (product.brand) rows.push({ label: "Brand", value: product.brand });
  rows.push({ label: "Category", value: product.categoryName });
  rows.push({ label: "Condition", value: conditionLabel(product.condition) });
  rows.push({ label: "Listing type", value: listingTypeLabel(product.listingType) });
  rows.push({ label: "Location", value: product.location });

  if (isRentable(product)) {
    if (product.minimumRentalDays) {
      rows.push({ label: "Minimum rental", value: `${product.minimumRentalDays} days` });
    }
    if (product.maximumRentalDays) {
      rows.push({ label: "Maximum rental", value: `${product.maximumRentalDays} days` });
    }
    if (product.securityDeposit) {
      rows.push({ label: "Security deposit", value: formatInr(product.securityDeposit) });
    }
  }

  rows.push({ label: "Units available", value: String(product.availableQuantity) });
  rows.push({
    label: "Delivery",
    value: product.allowsDelivery ? "Available" : "Not available",
  });
  rows.push({ label: "Pickup", value: product.allowsPickup ? "Available" : "Not available" });
  rows.push({ label: "Listed", value: format(new Date(product.createdAt), "d MMM yyyy") });

  return rows;
}

/** Rating summary; the distribution is computed from real reviews only. */
export function reviewSummary(
  product: Pick<ProductDetails, "ratingAverage" | "ratingCount">,
  reviews: ReviewItem[] = [],
): ProductReviewSummary {
  const buckets = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((review) => Math.round(review.rating) === stars).length,
  }));
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  const average =
    product.ratingCount > 0
      ? product.ratingAverage
      : total > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / total
        : 0;

  return {
    average,
    count: product.ratingCount || total,
    distribution: buckets.map((bucket) => ({
      ...bucket,
      share: total > 0 ? bucket.count / total : 0,
    })),
  };
}
