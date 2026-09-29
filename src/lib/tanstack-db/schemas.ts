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
