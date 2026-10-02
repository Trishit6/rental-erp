import { z } from "zod";

/**
 * Schemas for the client-side TanStack DB collections.
 *
 * These mirror the *API response* shapes (camelCase, paise), not the database
 * rows — the server is the source of truth and the API layer already normalises
 * its payloads; these schemas only guard what lands in the browser store, so a
 * malformed response degrades at the boundary instead of corrupting the cache.
 */

export const orderCollectionSchema = z.object({
  id: z.number(),
  /** The public `RV-2026-XXXXXX` identifier; the key the UI links with. */
  orderNumber: z.string().nullable(),
  orderType: z.string(),
  status: z.string(),
  paymentStatus: z.string(),
  subtotal: z.number(),
  deliveryFee: z.number(),
  depositTotal: z.number(),
  total: z.number(),
  currency: z.string(),
  deliveryMethod: z.string(),
  itemCount: z.number(),
  createdAt: z.string(),
});

export type OrderRow = z.infer<typeof orderCollectionSchema>;

export const orderItemCollectionSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  productId: z.number(),
  sellerId: z.number(),
  mode: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  titleSnapshot: z.string(),
  imageUrl: z.string().nullable(),
  productSlug: z.string().nullable(),
});

export type OrderItemRow = z.infer<typeof orderItemCollectionSchema>;

export const rentalCollectionSchema = z.object({
  id: z.number(),
  orderId: z.number(),
  productId: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.string(),
  dailyRate: z.number(),
  rentalSubtotal: z.number(),
  securityDeposit: z.number(),
});

export type RentalRow = z.infer<typeof rentalCollectionSchema>;

export const productCollectionSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  /** INR paise — money in the browser store is the same integer paise as the wire. */
  purchasePrice: z.number().nullable(),
  rentalPricePerDay: z.number().nullable(),
  listingType: z.string(),
  primaryImage: z.string().nullable(),
});

export type ProductRow = z.infer<typeof productCollectionSchema>;

export const categoryCollectionSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  productCount: z.number(),
});

export type CategoryRow = z.infer<typeof categoryCollectionSchema>;

/**
 * Public review rows.
 *
 * Only the fields a review card renders — no `userId`, no `orderItemId`, nothing
 * that would identify a customer beyond the public name and avatar the product
 * page already showed. The collection is derived from product-page responses the
 * visitor could read unauthenticated, so it holds nothing a signed-out browser
 * could not fetch for itself.
 */
export const reviewCollectionSchema = z.object({
  id: z.number(),
  productId: z.number(),
  rating: z.number(),
  purchaseType: z.string(),
  isVerifiedPurchase: z.boolean(),
  isEdited: z.boolean(),
  helpfulCount: z.number(),
  createdAt: z.string(),
});

export type ReviewRow = z.infer<typeof reviewCollectionSchema>;

/**
 * The signed-in seller's own listings.
 *
 * A **private** collection, unlike every other one here: the rows are the
 * seller's revenue, stock and ratings, readable by nobody but the session that
 * fetched them, so `clearPrivateCollections` wipes it on logout. A seller's
 * business figures sitting in the next customer's store is not a cache staleness
 * problem.
 *
 * Only the fields the dashboard and the listings table render. Nothing about
 * buyers: the order lines behind `soldUnits` are never fetched into the store,
 * only the count the server already aggregated.
 */
export const sellerProductCollectionSchema = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  listingType: z.string(),
  condition: z.string(),
  purchasePrice: z.number().nullable(),
  rentalPricePerDay: z.number().nullable(),
  quantity: z.number(),
  availableQuantity: z.number(),
  reservedQuantity: z.number(),
  ratingAverage: z.number(),
  ratingCount: z.number(),
  soldUnits: z.number(),
  rentalCount: z.number(),
  earnedPaise: z.number(),
  primaryImage: z.string().nullable(),
  createdAt: z.string(),
});

export type SellerProductRow = z.infer<typeof sellerProductCollectionSchema>;
