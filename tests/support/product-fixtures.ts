import type { ProductDetails, ProductSeller } from "@/features/product-details/types";

/** A complete, valid product payload — override only what a test cares about. */
export function makeProduct(overrides: Partial<ProductDetails> = {}): ProductDetails {
  return {
    id: 1,
    slug: "sony-wh-1000xm5",
    title: "Sony WH-1000XM5",
    location: "Bengaluru",
    categoryId: 1,
    categoryName: "Audio",
    categorySlug: "audio",
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
    description: "Barely used, with the original case and cable.",
    brand: "Sony",
    latitude: null,
    longitude: null,
    minimumRentalDays: 1,
    maximumRentalDays: 30,
    quantity: 6,
    rentToOwnEnabled: false,
    rentToOwnPrice: null,
    rentCreditPercentage: null,
    rentCreditCap: null,
    allowsDelivery: true,
    allowsPickup: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    images: [
      { id: 1, url: "https://example.com/headphones-1.jpg", altText: null },
      { id: 2, url: "https://example.com/headphones-2.jpg", altText: null },
    ],
    tags: ["wireless", "noise-cancelling"],
    seller: makeSeller(),
    ...overrides,
  };
}

export function makeSeller(overrides: Partial<ProductSeller> = {}): ProductSeller {
  return {
    id: 7,
    name: "Priya",
    avatarUrl: null,
    verified: true,
    bio: "Trusted neighbourhood seller.",
    joinedAt: "2025-03-01T00:00:00.000Z",
    listingsCount: 4,
    ratingAverage: 4.9,
    ratingCount: 20,
    ...overrides,
  };
}
