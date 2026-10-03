import type { AdminOverview, AdminProductFacets, AdminProductRow } from "@/features/admin/types";

/**
 * Admin fixtures.
 *
 * ## Deliberately awkward values, not tidy ones
 *
 * Each row exercises a case the table has to get right, because a fixture of
 * well-formed rows would pass whether or not the table handles any of them:
 *
 * - `purchasePrice: null` / `rentalPricePerDay: null` — the two halves of a listing
 *   are mutually exclusive, so a rendering-only listing must show an em dash rather
 *   than `₹0`, which would read as "free".
 * - `availableQuantity < quantity` — partial stock, the case where a "stock" column
 *   showing only one number is wrong.
 * - `status: "OUT_OF_STOCK"` and `status: "PAUSED"` — both are live, so both should
 *   offer "Disable"; a `DRAFT` should offer "Enable" instead.
 * - `condition: "LIKE_NEW"` — an underscore that must render as a space.
 * - `imageUrl: null` — the placeholder path, not a broken `<img>`.
 */

/** A row with every field populated, so a test can override just what it cares about. */
export function makeAdminProduct(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return {
    id: 101,
    title: "Vintage film camera",
    slug: "vintage-film-camera",
    status: "PUBLISHED",
    condition: "GOOD",
    listingType: "BOTH",
    categoryId: 14,
    categoryName: "Electronics",
    sellerId: 7,
    sellerName: "Daniel Kapoor",
    // 45,000 rupees, in paise. Deliberately not a round rupee figure, so a
    // missing or doubled conversion cannot accidentally look right.
    purchasePrice: 4_500_000,
    rentalPricePerDay: 750_00,
    quantity: 5,
    availableQuantity: 5,
    imageUrl: "https://cdn.revaro.local/camera.jpg",
    createdAt: "2026-01-14T09:30:00.000Z",
    ...overrides,
  };
}

/** A rental-only listing: no sale price at all. */
export function makeRentalOnlyProduct(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return makeAdminProduct({
    id: 102,
    title: "Projector, 3000 lumen",
    slug: "projector-3000-lumen",
    purchasePrice: null,
    rentalPricePerDay: 1_200_00,
    listingType: "RENT",
    ...overrides,
  });
}

/** A draft with stock already committed — not live, so it offers "Enable". */
export function makeDraftProduct(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return makeAdminProduct({
    id: 103,
    title: "Handmade ceramic bowl",
    slug: "handmade-ceramic-bowl",
    status: "DRAFT",
    condition: "LIKE_NEW",
    purchasePrice: 1_200_00,
    rentalPricePerDay: null,
    listingType: "SALE",
    categoryName: "Home & Kitchen",
    sellerName: "Maya Sharma",
    quantity: 4,
    availableQuantity: 1,
    imageUrl: null,
    ...overrides,
  });
}

/** A live listing with its last unit gone. */
export function makeOutOfStockProduct(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return makeAdminProduct({
    id: 104,
    title: "Mountain bike, 27.5 inch",
    slug: "mountain-bike-27-5-inch",
    status: "OUT_OF_STOCK",
    condition: "FAIR",
    quantity: 3,
    availableQuantity: 0,
    ...overrides,
  });
}

/** A paused listing — live, so it offers "Enable" to bring it back. */
export function makePausedProduct(overrides: Partial<AdminProductRow> = {}): AdminProductRow {
  return makeAdminProduct({
    id: 105,
    title: "Standing desk",
    slug: "standing-desk",
    status: "PAUSED",
    purchasePrice: 18_000_00,
    rentalPricePerDay: null,
    listingType: "SALE",
    ...overrides,
  });
}

export function makeAdminFacets(overrides: Partial<AdminProductFacets> = {}): AdminProductFacets {
  return {
    sellers: [
      { id: 7, name: "Daniel Kapoor" },
      { id: 9, name: "Maya Sharma" },
    ],
    categories: [
      { id: 14, name: "Electronics" },
      { id: 22, name: "Home & Kitchen" },
    ],
    ...overrides,
  };
}

/**
 * Every aggregate the dashboard shows, with values that are individually
 * recognisable — so a card wired to the wrong field is visible rather than
 * plausible.
 */
export function makeAdminOverview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    totalProducts: 20_022,
    activeProducts: 19_880,
    totalUsers: 95,
    totalSellers: 32,
    totalOrders: 345,
    activeRentals: 19,
    // 2,74,37,990 rupees in paise.
    totalRevenue: 27_437_990_300,
    pendingPayouts: 7,
    reviews: 203,
    openReports: 4,
    grossVolume: 27_437_990_300,
    ...overrides,
  };
}
