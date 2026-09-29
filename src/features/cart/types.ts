import type { ProductCondition } from "@/lib/product-search/types";
import type { ProductCardData } from "@/lib/types";

/**
 * Cart types.
 *
 * `RENT_AND_BUY` never appears here on purpose: it describes what a *product*
 * supports, not what a *cart line* is. A line is always a concrete `BUY` or
 * `RENT`, which is why `CartListingType` is a two-member union and the item
 * payload is a discriminated union on it. Rent-to-own is a later workflow.
 */

export type CartListingType = "BUY" | "RENT";

/** The seller summary a cart line shows. Never the full public seller view. */
export type CartSeller = {
  id: number;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
};

/** Everything a line needs about its product, fetched with the cart. */
export type CartItemProduct = {
  id: number;
  slug: string;
  title: string;
  location: string;
  condition: ProductCondition;
  listingType: string;
  status: string;
  categoryId: number;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  quantity: number;
  availableQuantity: number;
  sellerId: number;
  primaryImage: string | null;
  sellerName: string;
  sellerAvatarUrl: string | null;
  sellerVerified: boolean;
};

/**
 * Server-computed money for one line. All amounts are integer paise.
 *
 * A deposit is never part of `lineTotal`'s *charge*: it is reported separately
 * in `depositTotal` and only added into `estimatedTotal` so the user can see
 * exactly what is refundable.
 */
export type CartLinePricing = {
  /** Sale price for a purchase; the effective daily rate for a rental. */
  unitPrice: number;
  /** `unitPrice × quantity`, or `unitPrice × days × quantity` for a rental. */
  lineTotal: number;
  /** The rental portion of `lineTotal`. Always 0 for a purchase. */
  rentalCharge: number;
  /** Refundable deposit per unit. Always 0 for a purchase. */
  securityDeposit: number;
  /** `securityDeposit × quantity`. */
  depositTotal: number;
  /** Rental length in days. Always 0 for a purchase. */
  days: number;
};

export type CartIssueCode =
  | "PRODUCT_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "QUANTITY_UNAVAILABLE"
  | "RENTAL_UNAVAILABLE"
  | "MODE_UNSUPPORTED"
  | "OWN_LISTING";

/** One reason a line cannot be ordered as it stands. */
export type CartValidation = {
  code: CartIssueCode;
  message: string;
  field?: "quantity" | "listingType" | "rentalDuration" | "price";
  /** Set only for a price change: the price the user originally agreed to. */
  previousValue?: string;
  /** Set only for a price change. */
  currentValue?: string;
};

/** Fields shared by both line variants. */
type CartItemBase = {
  id: number;
  productId: number;
  quantity: number;
  /** ISO timestamps, or null for a purchase. */
  startDate: string | null;
  endDate: string | null;
  savedForLater: boolean;
  /** The product as it is *now*; null when the listing has been deleted. */
  product: CartItemProduct | null;
  pricing: CartLinePricing;
  issues: CartValidation[];
};

/** Something the user intends to buy. */
export type PurchaseCartItem = CartItemBase & {
  mode: "BUY";
  listingType: "BUY";
  rentalDuration: 0;
};

/** Something the user intends to rent for a window. */
export type RentalCartItem = CartItemBase & {
  mode: "RENT";
  listingType: "RENT";
  /** Rental length in days. Always ≥ 1 on a real line. */
  rentalDuration: number;
};

export type CartItem = PurchaseCartItem | RentalCartItem;

/** Cart-wide money, all computed by the server. */
export type CartTotals = {
  /** Purchases + rental charges, excluding deposits. */
  subtotal: number;
  /** The rental portion of `subtotal`. Zero for a purchase-only cart. */
  rentalCharges: number;
  /** Refundable, tracked apart from charges. */
  securityDeposits: number;
  /** `subtotal + securityDeposits`. Delivery and tax are added at checkout. */
  estimatedTotal: number;
  /** Distinct lines, ignoring saved-for-later. */
  itemCount: number;
  /** Sum of quantities, ignoring saved-for-later. This is the navbar badge. */
  quantityCount: number;
};

export type Cart = {
  id: number;
  items: CartItem[];
  totals: CartTotals;
};

export type CartCount = { count: number };

export type CartValidationResult = {
  valid: boolean;
  items: CartItem[];
  totals: CartTotals;
};

/** What every cart write answers with. */
export type CartMutationResult = {
  itemId: number;
  quantity: number;
  /** True when the add merged into an identical existing line. */
  merged: boolean;
};

/** Adding a line. `mode` is a cart mode, never a product capability. */
export type AddCartItemInput = {
  productId: number;
  mode: CartListingType;
  quantity: number;
  /** Required for a rental; ignored for a purchase. */
  startDate?: string;
  endDate?: string;
  savedForLater?: boolean;
};

/** A partial change to one line. */
export type UpdateCartItemInput = {
  quantity?: number;
  mode?: CartListingType;
  startDate?: string | null;
  endDate?: string | null;
  savedForLater?: boolean;
};

/** Re-exported so consumers can show a card-shaped product without a cast. */
export type { ProductCardData };
