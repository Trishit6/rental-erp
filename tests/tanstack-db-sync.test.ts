import { beforeEach, describe, expect, it } from "vitest";
import { getCollections, resetCollectionsForTests } from "../src/lib/tanstack-db/collections";
import {
  clearPrivateCollections,
  forgetConversationMessages,
  forgetNotification,
  patchOrderStatus,
  pushMessage,
  syncCategories,
  syncConversations,
  syncMessages,
  syncNotifications,
  syncOrderItems,
  syncOrders,
  syncProducts,
  syncRentals,
  syncSellerProducts,
  syncWalletPayouts,
  syncWalletTransactions,
} from "../src/lib/tanstack-db/sync";
import type {
  CategoryRow,
  ConversationRow,
  MessageRow,
  NotificationRow,
  OrderItemRow,
  OrderRow,
  ProductRow,
  RentalRow,
  SellerProductRow,
  WalletPayoutRow,
  WalletTransactionRow,
} from "../src/lib/tanstack-db/schemas";

/**
 * The TanStack DB layer is a *derived* store, so what matters is not that it
 * stores rows but which rows it keeps. Two rules carry all the risk:
 *
 *  - a private collection holds exactly the payload that was last synced into it
 *    (a list response is the whole truth for that screen);
 *  - a public collection *merges*, because several surfaces each sync only their
 *    own slice of the catalogue.
 *
 * Getting the second one wrong is silent: whichever surface synced last would
 * erase the others' rows and the store would simply look empty.
 */

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1,
    orderNumber: "RV-2026-8F3K2A",
    orderType: "PURCHASE",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    subtotal: 74_999_00,
    deliveryFee: 0,
    depositTotal: 0,
    total: 74_999_00,
    currency: "INR",
    deliveryMethod: "DELIVERY",
    itemCount: 1,
    createdAt: "2026-09-26T10:00:00.000Z",
    ...overrides,
  };
}

function orderItem(overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: 10,
    orderId: 1,
    productId: 100,
    sellerId: 7,
    mode: "BUY",
    quantity: 1,
    unitPrice: 74_999_00,
    lineTotal: 74_999_00,
    titleSnapshot: "Apple MacBook Air M2",
    imageUrl: null,
    productSlug: "apple-macbook-air-m2",
    ...overrides,
  };
}

function rental(overrides: Partial<RentalRow> = {}): RentalRow {
  return {
    id: 50,
    orderId: 1,
    productId: 100,
    startDate: "2026-09-26",
    endDate: "2026-09-29",
    status: "ACTIVE",
    dailyRate: 1_499_00,
    rentalSubtotal: 4_497_00,
    securityDeposit: 10_000_00,
    ...overrides,
  };
}

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 100,
    slug: "apple-macbook-air-m2",
    title: "Apple MacBook Air M2",
    purchasePrice: 74_999_00,
    rentalPricePerDay: 1_499_00,
    listingType: "BOTH",
    primaryImage: null,
    ...overrides,
  };
}

function category(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 3,
    slug: "electronics",
    name: "Electronics",
    icon: "laptop",
    productCount: 128,
    ...overrides,
  };
}

function notification(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 900,
    type: "ORDER_SHIPPED",
    title: "Order shipped",
    body: "Your order is on its way.",
    link: "/orders/RV-2026-8F3K2A",
    isRead: false,
    createdAt: "2026-09-26T10:00:00.000Z",
    category: "ORDERS",
    label: "Orders & purchases",
    icon: "ORDER",
    ...overrides,
  };
}

function conversation(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    conversationId: 5,
    productId: 100,
    productTitle: "Apple MacBook Air M2",
    productSlug: "apple-macbook-air-m2",
    lastMessageAt: "2026-09-26T10:00:00.000Z",
    unread: 2,
    otherUserName: "Priya S.",
    otherUserAvatarUrl: null,
    ...overrides,
  };
}

function message(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 700,
    conversationId: 5,
    senderId: 42,
    body: "Is this still available?",
    createdAt: "2026-09-26T10:00:00.000Z",
    isRead: false,
    ...overrides,
  };
}

function sellerProduct(overrides: Partial<SellerProductRow> = {}): SellerProductRow {
  return {
    id: 100,
    title: "Apple MacBook Air M2",
    slug: "apple-macbook-air-m2",
    status: "ACTIVE",
    listingType: "BOTH",
    condition: "EXCELLENT",
    purchasePrice: 74_999_00,
    rentalPricePerDay: 1_499_00,
    quantity: 3,
    availableQuantity: 2,
    reservedQuantity: 1,
    ratingAverage: 4.8,
    ratingCount: 12,
    soldUnits: 4,
    rentalCount: 6,
    earnedPaise: 120_000_00,
    primaryImage: null,
    createdAt: "2026-09-26T10:00:00.000Z",
    ...overrides,
  };
}

function walletTransaction(overrides: Partial<WalletTransactionRow> = {}): WalletTransactionRow {
  return {
    id: 300,
    type: "SALE",
    amount: 74_999_00,
    status: "COMPLETED",
    description: "Sale proceeds",
    reference: null,
    createdAt: "2026-09-26T10:00:00.000Z",
    ...overrides,
  };
}

function walletPayout(overrides: Partial<WalletPayoutRow> = {}): WalletPayoutRow {
  return {
    id: 400,
    payoutNumber: "PO-2026-1A2B3C",
    amount: 50_000_00,
    status: "PROCESSING",
    methodLabel: "UPI",
    requestedAt: "2026-09-26T10:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

/** Every key currently in a collection, sorted so assertions read cleanly. */
function keysOf(collection: { keys(): IterableIterator<unknown> }): unknown[] {
  return [...collection.keys()].sort();
}

beforeEach(() => {
  resetCollectionsForTests();
});

describe("private collections hold exactly the last payload", () => {
  it("replaces the order set, so a row that left the page leaves the store", () => {
    syncOrders([order(), order({ id: 2, orderNumber: "RV-2026-4K9P7D" })]);

    syncOrders([order({ id: 2, orderNumber: "RV-2026-4K9P7D" })]);

    expect(keysOf(getCollections().orders)).toEqual([2]);
  });

  it("empties the collection when a response carries no rows", () => {
    syncOrders([order()]);
    syncOrders([]);
    expect(keysOf(getCollections().orders)).toEqual([]);
  });

  it("mirrors lines and rentals under their own keys", () => {
    syncOrderItems([orderItem(), orderItem({ id: 11, mode: "RENT" })]);
    syncRentals([rental()]);

    expect(keysOf(getCollections().orderItems)).toEqual([10, 11]);
    expect(keysOf(getCollections().rentals)).toEqual([50]);
  });
});

describe("the correspondence collections never keep a previous screen's rows", () => {
  it("replaces the notification feed, so a filtered-out row leaves the store", () => {
    // The feed pages and filters in SQL. Merging would leave a notification readable in
    // the store after the user filtered to "Orders only" and it was not — the bell would
    // report a message the page insists is not there.
    syncNotifications([notification(), notification({ id: 901, type: "MESSAGE_RECEIVED" })]);

    syncNotifications([notification({ id: 901, type: "MESSAGE_RECEIVED" })]);

    expect(keysOf(getCollections().notifications)).toEqual([901]);
  });

  it("drops one notification immediately, before the refetch", () => {
    syncNotifications([notification(), notification({ id: 901 })]);

    forgetNotification(900);

    expect(keysOf(getCollections().notifications)).toEqual([901]);
  });

  it("replaces the conversation list", () => {
    syncConversations([conversation(), conversation({ conversationId: 6 })]);

    syncConversations([conversation({ conversationId: 6 })]);

    expect(keysOf(getCollections().conversations)).toEqual([6]);
  });

  it("does not carry one conversation's messages into the next", () => {
    /*
     * The single most dangerous assertion in this file.
     *
     * `messages` is keyed by message id alone, so a *merge* would leave the previous
     * thread's words in the store when the user opened a different conversation — the
     * one thing this collection must never do. The two ids below do not overlap, which
     * is the realistic case (message ids are global), and this is exactly why replace is
     * the correct semantics rather than merge.
     */
    syncMessages([message({ id: 700, conversationId: 5, body: "Is this still available?" })]);
    syncMessages([message({ id: 800, conversationId: 6, body: "Yes, it is." })]);

    const rows = [...getCollections().messages.values()] as MessageRow[];
    expect(rows.map((row) => row.id)).toEqual([800]);
    expect(rows.map((row) => row.body)).toEqual(["Yes, it is."]);
  });

  it("forgets a whole transcript when the page unmounts", () => {
    syncMessages([message({ id: 700 }), message({ id: 701 })]);
    syncConversations([conversation()]);

    forgetConversationMessages();

    // Only the message bodies go: the conversation list is a separate collection, and a
    // still-open thread should keep its place in the sidebar as a size, not a preview.
    expect(keysOf(getCollections().messages)).toEqual([]);
    expect(keysOf(getCollections().conversations)).toEqual([5]);
  });

  it("appends one message optimistically without duplicating it", () => {
    pushMessage(message({ id: 700, body: "First" }));
    // A refetch landing mid-send must not turn the optimistic write into a thrown
    // `CollectionOperationError`, which is what an unguarded insert of an existing key
    // would do inside the composer.
    expect(() => pushMessage(message({ id: 700, body: "First" }))).not.toThrow();

    expect(keysOf(getCollections().messages)).toEqual([700]);
  });
});

describe("seller-side private collections replace, because the filter is the screen's truth", () => {
  it("replaces the seller's listing page", () => {
    syncSellerProducts([sellerProduct(), sellerProduct({ id: 101 })]);

    syncSellerProducts([sellerProduct({ id: 101 })]);

    expect(keysOf(getCollections().sellerProducts)).toEqual([101]);
  });

  it("replaces the wallet ledger and the payout list", () => {
    syncWalletTransactions([walletTransaction(), walletTransaction({ id: 301 })]);
    syncWalletPayouts([walletPayout(), walletPayout({ id: 401 })]);

    syncWalletTransactions([walletTransaction({ id: 301 })]);
    syncWalletPayouts([walletPayout({ id: 401 })]);

    expect(keysOf(getCollections().walletTransactions)).toEqual([301]);
    expect(keysOf(getCollections().walletPayouts)).toEqual([401]);
  });
});

describe("patchOrderStatus", () => {
  it("updates one order in place, without a full re-sync", () => {
    syncOrders([order(), order({ id: 2, orderNumber: "RV-2026-4K9P7D" })]);

    patchOrderStatus(1, "CANCELLED");

    const rows = [...getCollections().orders.values()] as OrderRow[];
    expect(rows.find((row) => row.id === 1)?.status).toBe("CANCELLED");
    // The other order is untouched — a patch is per-order, not a rewrite.
    expect(rows.find((row) => row.id === 2)?.status).toBe("CONFIRMED");
  });

  it("is a no-op for an order the store never received", () => {
    syncOrders([order()]);
    expect(() => patchOrderStatus(999, "CANCELLED")).not.toThrow();
    expect(keysOf(getCollections().orders)).toEqual([1]);
  });
});

describe("public collections merge, because no surface owns the whole catalogue", () => {
  it("keeps rows another surface already synced", () => {
    syncProducts([product()]);
    // A second surface (a category page, the hero rail) syncs its own slice.
    syncProducts([product({ id: 101, slug: "sony-wh-1000xm5", title: "Sony WH-1000XM5" })]);

    expect(keysOf(getCollections().products)).toEqual([100, 101]);
  });

  it("refreshes a row it already holds instead of duplicating it", () => {
    syncProducts([product()]);
    syncProducts([product({ title: "Apple MacBook Air M2 (2024)" })]);

    const rows = [...getCollections().products.values()] as ProductRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Apple MacBook Air M2 (2024)");
  });

  it("merges the category directory the same way", () => {
    syncCategories([category()]);
    syncCategories([category({ id: 4, slug: "fashion", name: "Fashion", productCount: 74 })]);

    expect(keysOf(getCollections().categories)).toEqual([3, 4]);
  });
});

describe("clearPrivateCollections", () => {
  it("wipes every private row and keeps the public ones — exactly like logout eviction", () => {
    // Every private surface, populated. Listing them all is the point: the first version
    // of this test checked only orders, lines and rentals, which is how the seller,
    // wallet, notification and correspondence collections would have survived logout
    // unnoticed. On a shared machine that is the previous user's messages, readable.
    syncOrders([order()]);
    syncOrderItems([orderItem()]);
    syncRentals([rental()]);
    syncSellerProducts([sellerProduct()]);
    syncWalletTransactions([walletTransaction()]);
    syncWalletPayouts([walletPayout()]);
    syncNotifications([notification()]);
    syncConversations([conversation()]);
    syncMessages([message()]);

    syncProducts([product()]);
    syncCategories([category()]);

    clearPrivateCollections();

    const collections = getCollections();
    for (const name of [
      "orders",
      "orderItems",
      "rentals",
      "sellerProducts",
      "walletTransactions",
      "walletPayouts",
      "notifications",
      "conversations",
      "messages",
    ] as const) {
      expect(keysOf(collections[name]), `${name} survived logout`).toEqual([]);
    }

    // Public catalogue data is deliberately kept, so the next session does not
    // refetch it — and, more importantly, so a logout cannot leak private rows
    // by wiping too much.
    expect(keysOf(collections.products)).toEqual([100]);
    expect(keysOf(collections.categories)).toEqual([3]);
  });
});
