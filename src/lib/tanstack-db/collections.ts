import { createCollection, localOnlyCollectionOptions } from "@tanstack/db";
import {
  categoryCollectionSchema,
  orderCollectionSchema,
  orderItemCollectionSchema,
  productCollectionSchema,
  rentalCollectionSchema,
  reviewCollectionSchema,
  sellerProductCollectionSchema,
  walletPayoutCollectionSchema,
  walletTransactionCollectionSchema,
} from "./schemas";

/**
 * The client-side reactive store.
 *
 * TanStack DB is a *derived* store between TanStack Query and the UI, not a
 * second source of truth: MariaDB → Hono → TanStack Query → TanStack DB → UI.
 * Every collection below is a `local-only` in-memory collection that a sync
 * module writes into from data the query cache has already validated, and the
 * reactive UI subscribes to the collection rather than to yet another fetch.
 *
 * Entities were chosen by what the UI actually needs to join in memory (order
 * summaries against their items and rentals), not by mirroring the 22-table
 * schema. Nothing sensitive is here: no session tokens, no payment credentials,
 * no other user's data — collections only ever hold rows the session user's own
 * API responses contained.
 */

export type OrderCollection = ReturnType<typeof createOrdersCollection>;
export type OrderItemCollection = ReturnType<typeof createOrderItemsCollection>;
export type RentalCollection = ReturnType<typeof createRentalsCollection>;
export type ProductCollection = ReturnType<typeof createProductsCollection>;
export type CategoryCollection = ReturnType<typeof createCategoriesCollection>;
export type ReviewCollection = ReturnType<typeof createReviewsCollection>;
export type SellerProductCollection = ReturnType<typeof createSellerProductsCollection>;
export type WalletTransactionCollection = ReturnType<typeof createWalletTransactionsCollection>;
export type WalletPayoutCollection = ReturnType<typeof createWalletPayoutsCollection>;

/** Public order history, synced from the `/orders` list responses. */
export function createOrdersCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "orders",
      getKey: (row) => row.id,
      schema: orderCollectionSchema,
    }),
  );
}

/** Order lines, keyed by line id — joined against orders by `orderId` in queries. */
export function createOrderItemsCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "order-items",
      getKey: (row) => row.id,
      schema: orderItemCollectionSchema,
    }),
  );
}

/** The session user's rentals, synced from rental responses the user can see. */
export function createRentalsCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "rentals",
      getKey: (row) => row.id,
      schema: rentalCollectionSchema,
    }),
  );
}

/** Lightweight public product rows for cross-feature joins (e.g. hero cards). */
export function createProductsCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "products",
      getKey: (row) => row.id,
      schema: productCollectionSchema,
    }),
  );
}

/** Public categories — kept for reactive category navigation. */
export function createCategoriesCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "categories",
      getKey: (row) => row.id,
      schema: categoryCollectionSchema,
    }),
  );
}

/**
 * Public reviews, seen by any product page the visitor has opened.
 *
 * Deliberately *not* a private collection: these rows are public content the
 * API serves to guests, so they survive logout exactly as products and
 * categories do. It holds only the fields a card renders — never the reviewer's
 * user id, order line, or anything else about the transaction.
 */
export function createReviewsCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "reviews",
      getKey: (row) => row.id,
      schema: reviewCollectionSchema,
    }),
  );
}

/**
 * The signed-in seller's own listings.
 *
 * The one **private** product collection: `products` below holds public rows
 * that any visitor could fetch for themselves, whereas these are the seller's
 * own stock and earnings. It is therefore wiped by `clearPrivateCollections` on
 * logout rather than surviving like the catalogue does.
 */
export function createSellerProductsCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "seller-products",
      getKey: (row) => row.id,
      schema: sellerProductCollectionSchema,
    }),
  );
}

/**
 * The signed-in seller's wallet ledger.
 *
 * A **private** collection, and the most plainly private one in the file: every row
 * here is a number of rupees that belongs to exactly one person. It is wiped on
 * logout with the rest of the private set, and it holds only the projected columns the
 * ledger list renders — never a seller id (every row is the session seller's by
 * construction, so the column would be a constant), never an `idempotencyKey`, and
 * never a payout method beyond its masked label.
 *
 * It is a *derived* store, never a financial source of truth. Nothing in the UI may
 * compute a balance from these rows: the overview card reads the server's `SUM`, and
 * these rows exist so a ledger entry and the row beside it in the summary strip
 * cannot be two different fetches that happen to disagree.
 */
export function createWalletTransactionsCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "wallet-transactions",
      getKey: (row) => row.id,
      schema: walletTransactionCollectionSchema,
    }),
  );
}

/** The seller's own payout requests. Private, for the same reason as above. */
export function createWalletPayoutsCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: "wallet-payouts",
      getKey: (row) => row.id,
      schema: walletPayoutCollectionSchema,
    }),
  );
}

export type RevaroCollections = {
  orders: OrderCollection;
  orderItems: OrderItemCollection;
  rentals: RentalCollection;
  products: ProductCollection;
  categories: CategoryCollection;
  reviews: ReviewCollection;
  sellerProducts: SellerProductCollection;
  walletTransactions: WalletTransactionCollection;
  walletPayouts: WalletPayoutCollection;
};

/**
 * The one store instance, created lazily on first access in the browser.
 *
 * Collection instances are singletons by identity; creating them in module
 * scope would run at import time in Node during tests too, so they are built
 * on demand and cached. `resetCollectionsForTests` lets a test start clean.
 */
let collections: RevaroCollections | null = null;

export function getCollections(): RevaroCollections {
  if (!collections) {
    collections = {
      orders: createOrdersCollection(),
      orderItems: createOrderItemsCollection(),
      rentals: createRentalsCollection(),
      products: createProductsCollection(),
      categories: createCategoriesCollection(),
      reviews: createReviewsCollection(),
      sellerProducts: createSellerProductsCollection(),
      walletTransactions: createWalletTransactionsCollection(),
      walletPayouts: createWalletPayoutsCollection(),
    };
  }
  return collections;
}

/** Test hook: drop the singleton so the next access creates fresh collections. */
export function resetCollectionsForTests(): void {
  collections = null;
}
