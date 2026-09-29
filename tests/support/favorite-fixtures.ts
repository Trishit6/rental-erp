import type { FavoriteListResponse, FavoriteProduct } from "@/features/favorites/types";

/**
 * A saved product: the shared card shape plus the favourite's own id and the
 * moment *this user* saved it. Override only what the test cares about.
 */
export function makeFavoriteProduct(overrides: Partial<FavoriteProduct> = {}): FavoriteProduct {
  return {
    id: 1,
    slug: "sony-wh-1000xm5",
    title: "Sony WH-1000XM5",
    location: "Bengaluru",
    categoryId: 1,
    categoryName: "Audio",
    condition: "LIKE_NEW",
    listingType: "BOTH",
    status: "ACTIVE",
    purchasePrice: 2_990_000,
    rentalPricePerDay: 49_900,
    rentalPricePerWeek: 299_000,
    rentalPricePerMonth: 999_000,
    securityDeposit: 500_000,
    ratingAverage: 4.8,
    ratingCount: 128,
    favoriteCount: 12,
    viewCount: 300,
    primaryImage: "https://example.com/headphones-1.jpg",
    availableQuantity: 5,
    isFavorited: true,
    favoriteId: 900,
    savedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeFavoritePage(
  items: FavoriteProduct[],
  pagination: Partial<FavoriteListResponse["pagination"]> = {},
): FavoriteListResponse {
  const total = pagination.total ?? items.length;
  const pageSize = pagination.pageSize ?? 12;
  return {
    items,
    pagination: {
      page: pagination.page ?? 1,
      pageSize,
      total,
      totalPages: pagination.totalPages ?? Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
