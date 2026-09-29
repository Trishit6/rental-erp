import { createCollection, localOnlyCollectionOptions } from "@tanstack/db";
import { categoryCollectionSchema, orderCollectionSchema, orderItemCollectionSchema, productCollectionSchema, rentalCollectionSchema } from "./schemas";

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

export type RevaroCollections = {
  orders: OrderCollection;
  orderItems: OrderItemCollection;
  rentals: RentalCollection;
  products: ProductCollection;
  categories: CategoryCollection;
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
    };
  }
  return collections;
}

/** Test hook: drop the singleton so the next access creates fresh collections. */
export function resetCollectionsForTests(): void {
  collections = null;
}
