import type { ChangeMessage } from "@tanstack/db";
import { getCollections } from "./collections";
import type {
  CategoryRow,
  ConversationRow,
  MessageRow,
  NotificationRow,
  OrderItemRow,
  OrderRow,
  ProductRow,
  RentalRow,
  ReviewRow,
  SellerProductRow,
  WalletPayoutRow,
  WalletTransactionRow,
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

/** The collection surface `sync.ts` needs. */
type SyncTarget = {
  keys(): IterableIterator<unknown>;
  has(key: unknown): boolean;
  delete(key: unknown): unknown;
  update(key: unknown, updater: (draft: never) => void): unknown;
  insert(row: unknown): unknown;
};

/**
 * Merge rows by key, leaving rows this payload never mentioned alone.
 *
 * `insert` is only ever called for a key the collection does not hold: TanStack
 * DB *rejects* an insert of an existing key (`CollectionOperationError`), so an
 * overlapping re-sync — the same order in two filter results, a detail response
 * after a list page — has to update the rows it already has. Callers swallow
 * exceptions around the sync, which would turn that throw into a store that
 * quietly stops reflecting the server.
 */
function mergeByKey(
  collection: SyncTarget,
  keyOf: (row: Record<string, unknown>) => string | number,
  rows: Record<string, unknown>[],
): void {
  for (const row of rows) {
    const key = keyOf(row);
    if (collection.has(key)) {
      collection.update(key, (draft: never) => Object.assign(draft, row));
    } else {
      collection.insert(row);
    }
  }
}

/**
 * Replace the contents of one collection with the given rows.
 *
 * Right for a *list* response, which is the whole truth for that screen: a row
 * that fell out of the current page must not stay readable in the store. Keys
 * that survive the page are updated in place (see `mergeByKey`).
 */
function replaceAll(
  collection: SyncTarget,
  keyOf: (row: Record<string, unknown>) => string | number,
  rows: Record<string, unknown>[],
): void {
  const incomingKeys = new Set(rows.map(keyOf));
  for (const key of [...collection.keys()]) {
    if (!incomingKeys.has(key as string | number)) collection.delete(key);
  }
  mergeByKey(collection, keyOf, rows);
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

/**
 * Merge public product rows seen by any surface.
 *
 * Merged, not replaced: browse, a category page and the hero rail each sync the
 * slice they fetched, and none of them knows about the others' rows.
 */
export function syncProducts(products: ProductRow[]): void {
  mergeByKey(
    getCollections().products as never,
    (row) => row.id as number,
    products as unknown as Record<string, unknown>[],
  );
}

/** Merge the category directory. */
export function syncCategories(categories: CategoryRow[]): void {
  mergeByKey(
    getCollections().categories as never,
    (row) => row.id as number,
    categories as unknown as Record<string, unknown>[],
  );
}

/**
 * Merge the public reviews a product page has loaded.
 *
 * Merged, not replaced, for the same reason products are: browse, a product page
 * and a "most reviewed" rail each sync the slice they fetched, and no single
 * surface owns every published review. A review that drops out of the current
 * *filter* therefore stays readable — which is correct, because it is still a
 * real published review of a real product.
 *
 * Only the public projection is written (see `reviewCollectionSchema`): the
 * order line, the reviewer's user id and the seller's reply never enter the
 * store, so nothing written here is private to a session.
 */
export function syncReviews(reviews: ReviewRow[]): void {
  mergeByKey(
    getCollections().reviews as never,
    (row) => row.id as number,
    reviews as unknown as Record<string, unknown>[],
  );
}

/**
 * Mirror review API rows into the public collection.
 *
 * Takes the feature's richer `Review` shape and **projects** it down to the
 * collection schema rather than writing it wholesale: the store validates rows
 * against `reviewCollectionSchema`, and a row carrying the reviewer's user id,
 * order line and seller reply would be both a validation failure and a leak of
 * data this collection has no business holding.
 */
export function syncReviewsToCollection(
  reviews: {
    id: number;
    rating: number;
    purchaseType: string;
    isVerifiedPurchase: boolean;
    isEdited: boolean;
    helpfulCount: number;
    createdAt: string;
    product: { id: number };
  }[],
): void {
  syncReviews(
    reviews.map((review) => ({
      id: review.id,
      productId: review.product.id,
      rating: review.rating,
      purchaseType: review.purchaseType,
      isVerifiedPurchase: review.isVerifiedPurchase,
      isEdited: review.isEdited,
      helpfulCount: review.helpfulCount,
      createdAt: review.createdAt,
    })),
  );
}

/**
 * Mirror one page of the seller's wallet ledger into the private collection.
 *
 * **Replace**, for the same reason the seller-products sync does and not the reason
 * public products do: this list is the only surface that reads the collection, it
 * filters and pages in SQL, and *the filter is the truth for the screen*. Merging
 * would leave an entry readable in the store after the seller filtered to "Sales"
 * and it was not — which reads as the wallet lying.
 *
 * The feature's richer `WalletTransaction` rows are **projected** down to the
 * collection schema rather than written wholesale: the store validates against
 * `walletTransactionCollectionSchema`, and a row carrying `sellerId`,
 * `orderItemId` or `idempotencyKey` would be both a validation failure and a leak of
 * fields this collection has no business holding.
 */
export function syncWalletTransactions(rows: WalletTransactionRow[]): void {
  replaceAll(
    getCollections().walletTransactions as never,
    (row) => row.id as number,
    rows as unknown as Record<string, unknown>[],
  );
}

/**
 * Mirror the seller's payout requests.
 *
 * Also **replace**, but for the opposite reason to products: unlike the public
 * catalogue, this list is *the* truth for its screen, and a payout that dropped out
 * of the current window is not something the seller should still be able to read out
 * of the store.
 *
 * Projected the same way — the collection keeps the reference, the amount and the
 * status, and nothing else.
 */
export function syncWalletPayouts(rows: WalletPayoutRow[]): void {
  replaceAll(
    getCollections().walletPayouts as never,
    (row) => row.id as number,
    rows as unknown as Record<string, unknown>[],
  );
}

/**
 * Mirror one page of the seller's own listings into the private collection.
 *
 * **Replace**, not merge, and the distinction matters here in a way it does not
 * for public products. A public catalogue is never wholly owned by one screen:
 * browse, a category page and the hero rail each sync the slice they fetched, so
 * a row one of them drops is still real and still public. The seller's listings
 * page is different — it is the only surface that reads this collection, it
 * filters and pages in SQL, and *the filter is the truth for the screen*. Merging
 * would leave a listing readable in the store after the seller filtered to
 * "Out of stock" and it was not, which reads as the dashboard lying.
 *
 * Rows on other pages are genuinely absent from the store until fetched, which is
 * correct: the store mirrors what the browser has been told, not what exists.
 */
export function syncSellerProducts(rows: SellerProductRow[]): void {
  replaceAll(
    getCollections().sellerProducts as never,
    (row) => row.id as number,
    rows as unknown as Record<string, unknown>[],
  );
}

/**
 * Mirror one page of the signed-in user's notifications.
 *
 * **Replace**, like the wallet ledger, and for the same reason: the feed page filters
 * and pages in SQL, and *the filter is the truth for the screen*. Merging would leave
 * a notification readable in the store after the user filtered to "Orders only" and it
 * was not — which would let the bell report a message the page insists is not there.
 *
 * It is worth being precise about what this does *not* do: it does not own the unread
 * count. The badge's number is a `COUNT(*)` over the user's whole table
 * (`countUnread`), not a sum of the rows in the store, precisely so that it cannot go
 * stale by being derived from a page. The store mirrors the feed; the server owns the
 * badge.
 */
export function syncNotifications(rows: NotificationRow[]): void {
  replaceAll(
    getCollections().notifications as never,
    (row) => row.id as number,
    rows as unknown as Record<string, unknown>[],
  );
}

/**
 * Drop one notification from the store immediately, before the refetch.
 *
 * For the dismiss control. The delete mutation invalidates the list anyway, but an
 * invalidation refetches a whole page; removing the row now means a dismissed item
 * disappears on the click rather than a frame later, and stays gone if the refetch is
 * slow.
 */
export function forgetNotification(id: number): void {
  getCollections().notifications.delete(id);
}

/**
 * Mirror the conversation list.
 *
 * **Replace.** This is the whole truth for the messages page and nothing else writes
 * to this collection, so a thread that dropped out of the response should not survive
 * in the store as if it were still open.
 */
export function syncConversations(rows: ConversationRow[]): void {
  replaceAll(
    getCollections().conversations as never,
    (row) => row.conversationId as number,
    rows as unknown as Record<string, unknown>[],
  );
}

/**
 * Mirror one conversation's transcript.
 *
 * **Replace**, and more aggressively than anywhere else in this file: the `messages`
 * collection is keyed by message id alone, so a *merge* would leave the previous
 * thread's words in the store when the user opened a different conversation — the
 * one thing this collection must never do. Replacing drops every message whose id is
 * not in the new response, which for a transcript read is the whole previous thread.
 *
 * Rows are written for one conversation only, and `forgetConversationMessages` clears
 * them on navigate-away as well, so the store cannot accumulate transcripts the user
 * has stopped reading.
 */
export function syncMessages(rows: MessageRow[]): void {
  replaceAll(
    getCollections().messages as never,
    (row) => row.id as number,
    rows as unknown as Record<string, unknown>[],
  );
}

/**
 * Append one message without a refetch.
 *
 * The send mutation's optimistic write. Guarded on the message id not already being
 * present rather than blindly inserting, because TanStack DB throws on an insert of an
 * existing key and a refetch landing mid-send would otherwise turn a successful send
 * into a thrown error in the composer.
 */
export function pushMessage(row: MessageRow): void {
  const collection = getCollections().messages as never as SyncTarget;
  if (collection.has(row.id)) return;
  collection.insert(row);
}

/** Drop every cached message body — used when the messages page unmounts. */
export function forgetConversationMessages(): void {
  const collection = getCollections().messages as never as SyncTarget;
  for (const key of [...collection.keys()]) collection.delete(key);
}

/**
 * Drop a listing from the store after it is deleted outright.
 *
 * Archive leaves the row in place deliberately: the listing still exists, it has
 * just been withdrawn, and its history is exactly what the seller came to read.
 */
export function forgetSellerProduct(id: number): void {
  getCollections().sellerProducts.delete(id);
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
  const {
    orders,
    orderItems,
    rentals,
    sellerProducts,
    walletTransactions,
    walletPayouts,
    notifications,
    conversations,
    messages,
  } = getCollections();
  const wipe = (collection: {
    keys(): IterableIterator<unknown>;
    delete(key: unknown): unknown;
  }) => {
    for (const key of [...collection.keys()]) collection.delete(key);
  };
  wipe(orders as never);
  wipe(orderItems as never);
  wipe(rentals as never);
  // The seller's own stock and earnings are as private as their orders, and a
  // shared machine is the normal case for a marketplace demo.
  wipe(sellerProducts as never);
  // A wallet balance is the most plainly private number in the app — it belongs to
  // exactly one person — so it is wiped with the rest rather than being left to
  // outlive the session that fetched it.
  wipe(walletTransactions as never);
  wipe(walletPayouts as never);
  // Notifications, conversations and message bodies are the private correspondence
  // surface. They are wiped on the same logout path as the query keys above, because
  // the cache and the store must never disagree about what belongs to the session
  // that just ended: leaving the rows here would make a signed-out browser's store
  // the one place a previous user's activity was still readable.
  wipe(notifications as never);
  wipe(conversations as never);
  wipe(messages as never);
}

/** Test helper: index a change stream by key, the way consumers read it. */
export function changesByKey(
  changes: ChangeMessage<Record<string, unknown>>[],
): Map<unknown, ChangeMessage<Record<string, unknown>>> {
  return new Map(changes.map((change) => [change.key, change]));
}
