import type { ProductCardData, ProductImage, ProductSeller } from "@/lib/types";

/* Shared product shapes are re-exported (not redefined) so Home, Browse and
   Product Details can never drift apart. */
export type { ProductCardData, ProductImage, ProductSeller };

/** The complete product payload this page renders. */
export type ProductDetails = import("@/lib/types").ProductDetail;

/** Recommendation card — same shape the grids already render. */
export type RelatedProduct = ProductCardData;

/**
 * How a visitor wants the item. Uppercase on purpose: this is the *action* mode
 * (what the cart receives), not the browse URL vocabulary (`rent`/`buy`).
 */
export type ListingMode = "RENT" | "BUY" | "RENT_AND_BUY";

/** What the cart actually stores. `RENT_AND_BUY` is a page-level choice, not a cart mode. */
export type CartMode = "RENT" | "BUY";

/** One selectable rental duration, with the concrete dates it maps to. */
export type RentalOption = {
  days: number;
  label: string;
  startDate: string;
  endDate: string;
};

/** Result of `GET /api/products/:idOrSlug/availability`. */
export type ProductAvailability = {
  rentable: boolean;
  isAvailable: boolean;
  availableUnits: number;
  totalUnits: number;
  overlappingRentals: number;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  days: number | null;
  startDate: string | null;
  endDate: string | null;
};

/** Stock state the backend can actually justify. */
export type StockState = "AVAILABLE" | "LIMITED" | "UNAVAILABLE" | "OUT_OF_STOCK";

/** Aggregated rating for the review summary block. */
export type ProductReviewSummary = {
  average: number;
  count: number;
  distribution: { stars: number; count: number; share: number }[];
};

/** A single row of the specification table. */
export type ProductSpecification = {
  label: string;
  value: string;
};

/**
 * One button in the product action bar. `cartMode` is what the cart stores —
 * `RENT_AND_BUY` is a page-level choice that resolves to RENT or BUY.
 */
export type ProductAction = {
  id: string;
  label: string;
  cartMode: CartMode;
  tone: "primary" | "secondary";
  intent: "cart" | "checkout";
};

/** Add-to-cart payload — rental configuration travels with the item. */
export type AddToCartInput = {
  productId: number;
  mode: CartMode;
  quantity: number;
  startDate?: string;
  endDate?: string;
};
