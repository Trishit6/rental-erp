import type { Pagination } from "@/lib/api/client";

/**
 * Types for the seller's own product management.
 *
 * These mirror the JSON the seller API sends, which is camelCase and paise. The
 * *vocabularies* (status, listing type, sort keys, filter keys) are repeated
 * rather than imported from `src/lib/types.ts` in the one place that matters:
 * `PRODUCT_STATUSES` **is** imported, because that one is already a mirrored
 * pair asserted by `tests/listing-status.test.ts` and re-mirroring it would add
 * a second copy for no gain.
 */

/** One row of the seller's listings table. */
export type SellerProductRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  listingType: string;
  condition: string;
  categoryName: string;
  /** Paise. `null` for a rental-only listing. */
  purchasePrice: number | null;
  /** Paise. `null` for a sale-only listing. */
  rentalPricePerDay: number | null;
  securityDeposit: number | null;
  /** How many units exist in total. The seller's lever. */
  quantity: number;
  /** How many can still be bought. Also moved by checkout. */
  availableQuantity: number;
  /**
   * `quantity − availableQuantity`. **Read-only by construction** — there is no
   * setter anywhere in the API, because it is what live orders are holding and
   * a seller who could type over it could sell the same unit twice.
   */
  reservedQuantity: number;
  viewCount: number;
  favoriteCount: number;
  ratingAverage: number;
  ratingCount: number;
  soldUnits: number;
  rentalCount: number;
  /** Paise, net of refundable deposits. */
  earnedPaise: number;
  createdAt: string;
  primaryImage: string | null;
};

/** What references a product, which decides archive vs. delete. */
export type ProductReferences = {
  orders: number;
  rentals: number;
  reviews: number;
  favorites: number;
  /** Orders + rentals + reviews. Favourites do not block a delete. */
  blocking: number;
};

/** Everything the edit form needs, in one read. */
export type SellerProductDetail = Omit<
  SellerProductRow,
  "categoryName" | "soldUnits" | "rentalCount" | "earnedPaise" | "viewCount" | "favoriteCount"
> & {
  description: string;
  brand: string | null;
  categoryId: number;
  location: string;
  latitude: number | null;
  longitude: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  rentToOwnEnabled: boolean;
  rentToOwnPrice: number | null;
  rentCreditPercentage: number | null;
  rentCreditCap: number | null;
  allowsDelivery: boolean;
  allowsPickup: boolean;
  updatedAt: string;
  images: { id: number; url: string; sortOrder: number }[];
  tags: string[];
  references: ProductReferences;
};

export type SellerProductStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "OUT_OF_STOCK"
  | "PAUSED"
  | "ARCHIVED";

/** `SALE | RENT | BOTH` — the existing listing-type vocabulary. */
export type ListingMode = "SALE" | "RENT" | "BOTH";

export const LISTING_MODES: readonly ListingMode[] = ["SALE", "RENT", "BOTH"];

export const PRODUCT_CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "USED"] as const;
export type ProductCondition = (typeof PRODUCT_CONDITIONS)[number];

export const CONDITION_LABELS: Record<ProductCondition, string> = {
  NEW: "New",
  LIKE_NEW: "Like new",
  GOOD: "Good",
  FAIR: "Fair",
  USED: "Used",
};

/**
 * Sort keys, mirroring `SELLER_PRODUCT_SORTS` in
 * `server/lib/seller-product-queries.ts`.
 *
 * `most_sold` and `most_rented` are computed by the server from `order_items` and
 * `rentals`. They are not columns on `products` on purpose: a counter that only
 * moves when someone remembers to update it is how a dashboard ends up
 * confidently wrong.
 */
export const SELLER_PRODUCT_SORTS = [
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "most_sold",
  "most_rented",
  "top_rated",
] as const;
export type SellerProductSort = (typeof SELLER_PRODUCT_SORTS)[number];

export const SELLER_SORT_LABELS: Record<SellerProductSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  most_sold: "Most sold",
  most_rented: "Most rented",
  top_rated: "Top rated",
};

export const STOCK_FILTERS = ["in_stock", "out_of_stock"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

/**
 * The list's query state.
 *
 * All of it lives in the URL, so a filtered listing is a link a seller can send
 * to a colleague and a filtered page survives a refresh. See
 * `src/routes/dashboard/products.tsx` for the search-param parsers.
 */
export type SellerProductFilters = {
  page: number;
  pageSize: number;
  search: string;
  status: SellerProductStatus | "";
  listingType: ListingMode | "";
  stock: StockFilter | "";
  sort: SellerProductSort;
};

export const DEFAULT_SELLER_PRODUCT_FILTERS: SellerProductFilters = {
  page: 1,
  pageSize: 20,
  search: "",
  status: "",
  listingType: "",
  stock: "",
  sort: "newest",
};

export type SellerProductListResponse = {
  rows: SellerProductRow[];
  pagination: Pagination;
};

/** The body of a create or edit. `images` and `tags` are replaced wholesale. */
export type ProductPayload = {
  title: string;
  description: string;
  categoryId: number;
  brand?: string;
  condition: ProductCondition;
  listingType: ListingMode;
  location: string;
  latitude?: number;
  longitude?: number;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  rentToOwnEnabled: boolean;
  rentToOwnPrice: number | null;
  rentCreditPercentage: number | null;
  rentCreditCap: number | null;
  quantity: number;
  images: string[];
  tags: string[];
  allowsDelivery: boolean;
  allowsPickup: boolean;
};

/** Statuses a seller can set. `OUT_OF_STOCK` is derived, `DRAFT` is creation-time. */
export type SettableStatus = "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED";

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Live",
  OUT_OF_STOCK: "Out of stock",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};
