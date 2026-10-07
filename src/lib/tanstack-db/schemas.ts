import { z } from "zod";

/**
 * Schemas for the client-side TanStack DB collections.
 *
 * These mirror the *API response* shapes (camelCase, paise), not the database
 * rows — the server is the source of truth and the API layer already normalises
 * its payloads; these schemas only guard what lands in the browser store, so a
 * malformed response degrades at the boundary instead of corrupting the cache.
 */

/**
 * The signed-in user, exactly as `GET /api/auth/me` projected them.
 *
 * ## What makes this schema different from the others
 *
 * It is a *deny-list enforced by construction*: the shape has no field a token
 * could occupy, and `.strict()` makes an extra one a validation **failure**
 * rather than something that is quietly stored. `accessToken`, `refreshToken`
 * and `passwordHash` are therefore not "excluded" here — they cannot be written,
 * so a response that carried one would be rejected at the boundary instead of
 * landing in the store. The credential for this session lives in an HttpOnly
 * cookie the browser holds and this code cannot read, and this row is the *only*
 * thing the client keeps about who is signed in.
 *
 * `isAuthenticated` is derived, never asserted: a row is written only when the
 * server answered with a user, so it is always `true`. It exists so a reader
 * never has to infer the state from a collection's emptiness — and so "the store
 * says signed in" remains visibly a *report* of a server answer, not a claim the
 * client could have made on its own.
 */
export const authUserCollectionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
    verified: z.boolean(),
    avatarUrl: z.string().nullable(),
    phone: z.string().nullable(),
    isAuthenticated: z.boolean(),
  })
  .strict();

export type AuthUserRow = z.infer<typeof authUserCollectionSchema>;

/** What a caller supplies: the server's user, without the derived flag. */
export type AuthUserInput = Omit<AuthUserRow, "isAuthenticated" | "phone"> & {
  phone?: string | null;
};


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
/**
 * The signed-in seller's wallet rows.
 *
 * **Private**, like `sellerProductCollectionSchema`: this is one seller's money, and
 * `clearPrivateCollections` wipes it on logout. A balance sitting in the next
 * customer's store is not a cache-staleness problem.
 *
 * The projection is deliberately minimal — the fields a ledger row renders. It holds
 * no `sellerId` (the store only ever contains the session seller's rows, so the
 * column would be a constant) and no `idempotencyKey`, which is a server-side
 * recording guard and has no meaning outside the transaction that used it.
 */
export const walletTransactionCollectionSchema = z.object({
  id: z.number(),
  type: z.string(),
  /** Signed integer paise — the sign is meaningful and is preserved. */
  amount: z.number(),
  status: z.string(),
  description: z.string(),
  reference: z.string().nullable(),
  createdAt: z.string(),
});

export type WalletTransactionRow = z.infer<typeof walletTransactionCollectionSchema>;

/** The seller's own payout requests. Private, for the same reason. */
export const walletPayoutCollectionSchema = z.object({
  id: z.number(),
  payoutNumber: z.string(),
  amount: z.number(),
  status: z.string(),
  methodLabel: z.string(),
  requestedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type WalletPayoutRow = z.infer<typeof walletPayoutCollectionSchema>;

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

/**
 * The signed-in user's notifications.
 *
 * **Private**, like every wallet and seller row here, and the reason is stronger than
 * the others: a notification feed is a record of what somebody bought, booked, was
 * told and was paid. It is wiped by `clearPrivateCollections` on logout.
 *
 * The projection is the fields the bell's dropdown and the feed page render. The
 * `category`/`label`/`icon` triple is *derived by the server*
 * (`server/lib/notification-queries.ts`) rather than resolved here, which is the point:
 * the client holds no vocabulary table to drift out of step with the writer's, and an
 * unrecognised `type` from a row seeded before that vocabulary existed renders as a
 * neutral bell instead of a blank line.
 */
export const notificationCollectionSchema = z.object({
  id: z.number(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  /** A resolved internal route, or `null` when the type has no destination. */
  link: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.string(),
  category: z.string(),
  label: z.string(),
  icon: z.string(),
});

export type NotificationRow = z.infer<typeof notificationCollectionSchema>;

/**
 * The signed-in user's conversation list.
 *
 * **Private**, and the only collection in this file holding another person's name and
 * avatar: those are the counterparties the user chose to talk to. Wiped on logout with
 * the rest.
 *
 * Note what is *absent* — no preview of the last message's body, no sender id per
 * message. The list carries a `lastMessageAt` and an unread count, both of which the
 * server computes, so the store never holds a transcript fragment that outlives the
 * session that fetched it.
 */
export const conversationCollectionSchema = z.object({
  conversationId: z.number(),
  productId: z.number().nullable(),
  productTitle: z.string().nullable(),
  productSlug: z.string().nullable(),
  lastMessageAt: z.string(),
  unread: z.number(),
  otherUserName: z.string().nullable(),
  otherUserAvatarUrl: z.string().nullable(),
});

export type ConversationRow = z.infer<typeof conversationCollectionSchema>;

/**
 * One conversation's messages.
 *
 * **Private**, and the most sensitive collection in the app: this is the literal
 * content of private correspondence. It is wiped on logout and is never merged from
 * more than one surface (a thread is read in one place), so there is no path by which
 * a message fetched for one thread ends up displayed against another.
 */
export const messageCollectionSchema = z.object({
  id: z.number(),
  conversationId: z.number(),
  senderId: z.number(),
  body: z.string(),
  createdAt: z.string(),
  isRead: z.boolean(),
});

export type MessageRow = z.infer<typeof messageCollectionSchema>;
