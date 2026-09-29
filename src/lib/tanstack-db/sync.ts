import type { ChangeMessage } from "@tanstack/db";
import { getCollections } from "./collections";
import type {
  CategoryRow,
  OrderItemRow,
  OrderRow,
  ProductRow,
  RentalRow,
} from "./schemas";

/**
 * Sync: TanStack Query → TanStack DB.
 *
 * One direction, one writer. The query cache remains the fetch/invalidation
 * layer (features keep their `useQuery` hooks); these helpers are called from
 * `query.ts` data boundaries to mirror the freshest API payloads into the
 * reactive collections. Components that need cross-entity reads subscribe to a
 * collection instead of issuing another request.
 *
 * Private rows are wiped the moment the session ends: `clearPrivateCollections`
 * is wired into the same logout path that evicts `privateQueryKeys`, so one
 * user's orders can never be read from the store by the next one.
 */

/**
 * Replace the contents of one collection with the given rows.
 *
 * Deletions are computed first, then one bulk insert applies the new state —
 * `collection.insert` on a local-only collection commits synchronously, so a
 * reader never observes the in-between.
 */
function replaceAll<TCollection extends { keys(): IterableIterator<unknown>; delete(key: unknown): unknown; insert(rows: unknown): unknown }>(
  collection: TCollection,
  keyOf: (row: Record<string, unknown>) => string | number,
  rows: Record<string, unknown>[],
): void {
  const incomingKeys = new Set(rows.map(keyOf));
  for (const key of [...collection.keys()]) {
    if (!incomingKeys.has(key as string | number)) collection.delete(key);
  }
  if (rows.length > 0) collection.insert(rows);
}

/** Mirror an order-list page into the `orders` collection. */
export function syncOrders(orders: OrderRow[]): void {
  replaceAll(
    getCollections().orders as never,
    (row) => row.id as number,
    orders as unknown as Record<string, unknown>[],
  );
}

/** Mirror order lines (from a detail response) into the `orderItems` collection. */
export function syncOrderItems(items: OrderItemRow[]): void {
  replaceAll(
    getCollections().orderItems as never,
    (row) => row.id as number,
    items as unknown as Record<string, unknown>[],
  );
}

/** Mirror the user's rentals into the `rentals` collection. */
export function syncRentals(rentals: RentalRow[]): void {
  replaceAll(
    getCollections().rentals as never,
    (row) => row.id as number,
    rentals as unknown as Record<string, unknown>[],
  );
}

/** Upsert public product rows seen by any surface. */
export function syncProducts(products: ProductRow[]): void {
  replaceAll(
    getCollections().products as never,
    (row) => row.id as number,
    products as unknown as Record<string, unknown>[],
  );
}

/** Upsert the category directory. */
export function syncCategories(categories: CategoryRow[]): void {
  replaceAll(
    getCollections().categories as never,
    (row) => row.id as number,
    categories as unknown as Record<string, unknown>[],
  );
}

/**
 * Apply a single status change without a full re-sync — used by the cancellation
 * mutation so the collection reflects the new state optimistically, before the
 * invalidated query refetches and reconciles.
 */
export function patchOrderStatus(orderId: number, status: string): void {
  const collection = getCollections().orders;
  if (!collection.has(orderId)) return;
  collection.update(orderId, (draft) => {
    (draft as OrderRow).status = status;
  });
}

/**
 * Drop every private row. Public rows (products, categories) survive, exactly
 * matching how `privateQueryKeys` eviction treats the query cache.
 */
export function clearPrivateCollections(): void {
  const { orders, orderItems, rentals } = getCollections();
  const wipe = (collection: { keys(): IterableIterator<unknown>; delete(key: unknown): unknown }) => {
    for (const key of [...collection.keys()]) collection.delete(key);
  };
  wipe(orders as never);
  wipe(orderItems as never);
  wipe(rentals as never);
}

/** Test helper: index a change stream by key, the way consumers read it. */
export function changesByKey(changes: ChangeMessage<Record<string, unknown>>[]): Map<unknown, ChangeMessage<Record<string, unknown>>> {
  return new Map(changes.map((change) => [change.key, change]));
}
