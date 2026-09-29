export type ProductCardData = {
  id: number;
  slug: string;
  title: string;
  location: string;
  categoryId: number;
  categoryName: string;
  condition: string;
  listingType: string;
  status: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  rentalPricePerWeek: number | null;
  rentalPricePerMonth: number | null;
  securityDeposit: number | null;
  ratingAverage: number;
  ratingCount: number;
  favoriteCount: number;
  viewCount: number;
  primaryImage: string | null;
  availableQuantity: number;
  /**
   * Whether the signed-in user has saved this product. The API always sends it
   * (`false` for guests), so a card never has to ask — this is what keeps
   * favourite state out of an N+1 request pattern.
   */
  isFavorited?: boolean;
};

export type ProductImage = {
  id: number;
  url: string;
  altText: string | null;
};

/** Public seller view — deliberately has no email, phone or session data. */
export type ProductSeller = {
  id: number;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  bio: string | null;
  joinedAt: string;
  listingsCount: number;
  ratingAverage: number;
  ratingCount: number;
};

/** The full product payload `GET /api/products/:idOrSlug` returns. */
export type ProductDetail = ProductCardData & {
  description: string;
  brand: string | null;
  categorySlug: string;
  latitude: number | null;
  longitude: number | null;
  minimumRentalDays: number | null;
  maximumRentalDays: number | null;
  quantity: number;
  rentToOwnEnabled: boolean;
  rentToOwnPrice: number | null;
  rentCreditPercentage: number | null;
  rentCreditCap: number | null;
  allowsDelivery: boolean;
  allowsPickup: boolean;
  createdAt: string;
  updatedAt: string;
  images: ProductImage[];
  tags: string[];
  seller: ProductSeller | null;
};

/**
 * A category exactly as `GET /api/categories` returns it. `parentId` is null for a
 * top-level category; `productCount` includes the products of its subcategories and
 * `subcategoryCount` is the number of active children. Both counts come from the API
 * — the client never derives or invents them.
 */
export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  /** Whitelist key the client maps to an icon glyph (never a component name). */
  icon: string | null;
  parentId: number | null;
  sortOrder: number;
  isFeatured: boolean;
  productCount: number;
  subcategoryCount: number;
};

/** `GET /api/categories/:idOrSlug` — a category plus its parent for breadcrumbs. */
export type CategoryDetail = Category & {
  parent: Category | null;
};

export type CartItem = {
  id: number;
  productId: number;
  mode: "BUY" | "RENT";
  quantity: number;
  startDate: string | null;
  endDate: string | null;
  savedForLater: boolean;
  title: string;
  slug: string;
  location: string;
  purchasePrice: number | null;
  rentalPricePerDay: number | null;
  securityDeposit: number | null;
  availableQuantity: number;
  listingType: string;
  primaryImage: string | null;
};

export type OrderSummary = {
  id: number;
  /** Public `RV-2026-XXXXXX`. Absent on rows created before Feature 10. */
  orderNumber?: string | null;
  orderType: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  depositTotal: number;
  total: number;
  deliveryMethod: string;
  trackingNumber: string | null;
  createdAt: string;
};

export type OrderDetail = OrderSummary & {
  deliveryAddressSnapshot: string | null;
  paymentProvider: string;
  paymentReference: string | null;
  items: {
    id: number;
    productId: number;
    mode: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    titleSnapshot: string;
    startDate: string | null;
    endDate: string | null;
    rentalDays: number | null;
    productSlug: string;
    primaryImage: string | null;
  }[];
};

export type RentalItem = {
  id: number;
  orderId: number;
  productId: number;
  startDate: string;
  endDate: string;
  actualReturnDate: string | null;
  dailyRate: number;
  rentalSubtotal: number;
  securityDeposit: number;
  total: number;
  status: string;
  rentCreditApplied: number;
  title: string;
  productSlug: string;
  primaryImage: string | null;
};

export type ReviewItem = {
  id: number;
  rating: number;
  title: string | null;
  comment: string;
  createdAt: string;
  userName: string;
  userAvatar: string | null;
};

export type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ConversationItem = {
  conversationId: number;
  productId: number | null;
  lastMessageAt: string;
  productTitle: string | null;
  productSlug: string | null;
  unread: number;
  otherUser: { id: number; name: string; avatarUrl: string | null } | null;
};

export type MessageItem = {
  id: number;
  senderId: number;
  body: string;
  createdAt: string;
  senderName: string;
};

export type MarketplaceStats = {
  activeListings: number;
  availableRentals: number;
  verifiedSellers: number;
};

/* ------------------------------ shared vocabulary ------------------------------ */
/* Product filter vocabulary shared by Browse, Home and Product Details. Kept here
   (not in a feature) so shared components never import from a feature module. */

/** Listing capability. `rent-and-buy` means the item supports both. */
export type ListingMode = "rent" | "buy" | "rent-and-buy";

/** Condition vocabulary — mirrors the `products.condition` column exactly. */
export type ProductCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "USED";

/** Stock state the backend can actually answer for. */
export type ProductAvailability = "available-now" | "for-rent" | "for-buy";

/**
 * The product (listing) lifecycle — mirrors `PRODUCT_STATUSES` in
 * `server/lib/product-status.ts` exactly; `tests/listing-status.test.ts` asserts
 * the two agree, so a value can never exist on one side of the wire only.
 *
 * `OUT_OF_STOCK` is still publicly visible (a live listing with no stock), which
 * is why public visibility is a predicate and not `status === "PUBLISHED"`.
 */
export type ProductStatus = "DRAFT" | "PUBLISHED" | "OUT_OF_STOCK" | "PAUSED" | "ARCHIVED";

export const PRODUCT_STATUSES: readonly ProductStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "OUT_OF_STOCK",
  "PAUSED",
  "ARCHIVED",
];

/** Statuses a seller may set by hand — `OUT_OF_STOCK` is derived from inventory. */
export const SELLER_SETTABLE_STATUSES: readonly ProductStatus[] = [
  "PUBLISHED",
  "PAUSED",
  "ARCHIVED",
];

/** Statuses that may appear in public discovery and product details. */
export const PUBLIC_PRODUCT_STATUSES: readonly ProductStatus[] = ["PUBLISHED", "OUT_OF_STOCK"];

/** Human labels for the listing lifecycle (single source for every badge). */
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  OUT_OF_STOCK: "Out of stock",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

/**
 * Whether a listing may be rendered in public discovery / on its detail page.
 * Mirrors `isPubliclyVisible` in `server/lib/product-status.ts`. An
 * `OUT_OF_STOCK` listing is still visible — it has run out, it is not withdrawn.
 */
export function isPubliclyVisible(status: string | null | undefined): boolean {
  return !!status && PUBLIC_PRODUCT_STATUSES.includes(status as ProductStatus);
}

/** Whether a buyer may actually buy or rent it. */
export function isPurchasable(status: string | null | undefined): boolean {
  return status === "PUBLISHED";
}

/** Sort keys the products API whitelists. */
export type ProductSort =
  | "recommended"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "rental_asc"
  | "most_viewed"
  | "most_favorited";

/** Human labels for the condition enum (single source for every card/badge). */
export const CONDITION_LABELS: Record<ProductCondition, string> = {
  NEW: "New",
  LIKE_NEW: "Like new",
  GOOD: "Good",
  FAIR: "Fair",
  USED: "Used",
};

/** Human labels for listing capability. */
export const LISTING_MODE_LABELS: Record<string, string> = {
  SALE: "For sale",
  RENT: "For rent",
  BOTH: "Rent + buy",
};
