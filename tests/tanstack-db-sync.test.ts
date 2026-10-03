import { beforeEach, describe, expect, it } from "vitest";
import { getCollections, resetCollectionsForTests } from "../src/lib/tanstack-db/collections";
import {
  clearPrivateCollections,
  patchOrderStatus,
  syncCategories,
  syncOrderItems,
  syncOrders,
  syncProducts,
  syncRentals,
} from "../src/lib/tanstack-db/sync";
import type {
  CategoryRow,
  OrderItemRow,
  OrderRow,
  ProductRow,
  RentalRow,
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
  it("wipes private rows and keeps public ones — exactly like logout eviction", () => {
    syncOrders([order()]);
    syncOrderItems([orderItem()]);
    syncRentals([rental()]);
    syncProducts([product()]);
    syncCategories([category()]);

    clearPrivateCollections();

    const { orders, orderItems, rentals, products, categories } = getCollections();
    expect(keysOf(orders)).toEqual([]);
    expect(keysOf(orderItems)).toEqual([]);
    expect(keysOf(rentals)).toEqual([]);
    // Public catalogue data is deliberately kept, so the next session does not
    // refetch it — and, more importantly, so a logout cannot leak private rows
    // by wiping too much.
    expect(keysOf(products)).toEqual([100]);
    expect(keysOf(categories)).toEqual([3]);
  });
});
