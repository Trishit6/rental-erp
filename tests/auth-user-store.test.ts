import { beforeEach, describe, expect, it } from "vitest";
import { getCollections, resetCollectionsForTests } from "../src/lib/tanstack-db/collections";
import {
  clearPrivateCollections,
  syncAuthUser,
  syncOrders,
  syncProducts,
} from "../src/lib/tanstack-db/sync";
import {
  authUserCollectionSchema,
  type OrderRow,
  type ProductRow,
} from "../src/lib/tanstack-db/schemas";

/**
 * The reactive store's copy of *who is signed in*.
 *
 * ## What is actually at stake
 *
 * `authUser` is the one collection whose contents are a statement about the
 * session rather than about a page of data, so three properties carry all the
 * risk:
 *
 *  1. **Exactly one row, or none.** The browser has one session identity. A
 *     second sign-in replacing the first is the difference between "switched
 *     account" and "the store still answers as the previous customer" on a
 *     shared machine.
 *  2. **It goes when the session goes.** `clearPrivateCollections` wipes it
 *     first, because every other private row belongs to the person it names.
 *  3. **It cannot hold a credential.** The schema is `.strict()`, so a token
 *     field is a validation *failure* rather than something quietly stored —
 *     the cookie is HttpOnly and this row is the only thing the client keeps
 *     about who is signed in.
 */

function signedIn(
  id: number,
  overrides: Partial<{ name: string; email: string; role: string }> = {},
) {
  return {
    id,
    name: overrides.name ?? `User ${id}`,
    email: overrides.email ?? `user${id}@example.com`,
    role: overrides.role ?? "USER",
    verified: false,
    avatarUrl: null,
  };
}

function product(id: number): ProductRow {
  return {
    id,
    slug: `product-${id}`,
    title: `Product ${id}`,
    purchasePrice: 100_00,
    rentalPricePerDay: 50_00,
    listingType: "BOTH",
    primaryImage: null,
  };
}

function order(id: number): OrderRow {
  return {
    id,
    orderNumber: `RV-2026-${id}`,
    orderType: "PURCHASE",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    subtotal: 100_00,
    deliveryFee: 0,
    depositTotal: 0,
    total: 100_00,
    currency: "INR",
    deliveryMethod: "DELIVERY",
    itemCount: 1,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  resetCollectionsForTests();
});

/** The row as stored, minus TanStack DB's own `$`-prefixed bookkeeping fields. */
function appFields(row: unknown): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).filter(([key]) => !key.startsWith("$")),
  );
}

describe("the store records one signed-in user and nothing more", () => {
  it("writes the sanitized projection with the derived flag", () => {
    syncAuthUser(signedIn(7));

    const row = getCollections().authUser.get(7);
    expect(row).toBeDefined();
    expect(row?.isAuthenticated).toBe(true);
    // Absent from the payload, defaulted by the sync — a reader never has to
    // infer signed-in state from the collection's emptiness.
    expect(row?.phone).toBeNull();
    expect(authUserCollectionSchema.safeParse(appFields(row)).success).toBe(true);
  });

  it("holds no field a token could occupy", () => {
    syncAuthUser(signedIn(7));
    const row = getCollections().authUser.get(7);

    // `$key` and friends are TanStack DB's own envelope, not application state.
    expect(Object.keys(appFields(row)).sort()).toEqual([
      "avatarUrl",
      "email",
      "id",
      "isAuthenticated",
      "name",
      "phone",
      "role",
      "verified",
    ]);
  });

  it("replaces the previous user rather than accumulating them", () => {
    syncAuthUser(signedIn(7));
    syncAuthUser(signedIn(42, { email: "next@example.com" }));

    const keys = [...getCollections().authUser.keys()];
    expect(keys).toEqual([42]);
    expect(getCollections().authUser.get(42)?.email).toBe("next@example.com");
    expect(getCollections().authUser.get(7)).toBeUndefined();
  });

  it("updates a re-sync of the same user in place", () => {
    // TanStack DB throws on an insert of an existing key, so "the profile page
    // refetched" must not become "the sync threw".
    syncAuthUser(signedIn(7));
    expect(() => syncAuthUser(signedIn(7, { name: "Renamed", role: "SELLER" }))).not.toThrow();

    const row = getCollections().authUser.get(7);
    expect(row?.name).toBe("Renamed");
    expect(row?.role).toBe("SELLER");
    expect([...getCollections().authUser.keys()]).toHaveLength(1);
  });

  it("empties when the session ends", () => {
    syncAuthUser(signedIn(7));
    syncAuthUser(null);

    expect([...getCollections().authUser.keys()]).toHaveLength(0);
  });
});

describe("the strict schema makes a token unwritable", () => {
  it("refuses an insert carrying an access-token field", () => {
    const collection = getCollections().authUser;

    expect(() =>
      collection.insert({
        ...signedIn(7),
        isAuthenticated: true,
        accessToken: "eyJhbGciOi",
      } as never),
    ).toThrow(/accessToken/);
    expect([...collection.keys()]).toHaveLength(0);
  });

  it("refuses the same row at the schema, independently of the collection", () => {
    // Belt and braces: the collection validates on insert, the schema is what
    // that validation is derived from. Asserting both means a collection that
    // stops validating cannot pass this suite.
    const result = authUserCollectionSchema.safeParse({
      ...signedIn(7),
      isAuthenticated: true,
      refreshToken: "eyJhbGciOi",
    });

    expect(result.success).toBe(false);
  });
});

describe("logout empties identity along with the private rows", () => {
  it("wipes the user and the private data, leaving the public catalogue", () => {
    syncAuthUser(signedIn(7));
    syncOrders([order(1)]);
    syncProducts([product(1)]);

    clearPrivateCollections();

    const collections = getCollections();
    expect([...collections.authUser.keys()]).toHaveLength(0);
    expect([...collections.orders.keys()]).toHaveLength(0);
    // Public rows survive, exactly matching how `privateQueryKeys` eviction
    // treats the query cache: the next visitor sees the shopfront, not a
    // sign-in prompt on every page.
    expect([...collections.products.keys()]).toEqual([1]);
  });
});
