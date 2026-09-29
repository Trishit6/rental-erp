import type { Category, CategoryDetail, ProductCardData } from "@/lib/types";

/**
 * A category exactly as `GET /api/categories` returns one. Counts are real fields on
 * the API response, so fixtures supply them rather than letting tests assume a shape.
 */
export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: "Electronics",
    slug: "electronics",
    description: "Laptops, phones, cameras and audio you can rent or own",
    imageUrl: "https://images.unsplash.com/photo-electronics",
    icon: "laptop",
    parentId: null,
    sortOrder: 1,
    isFeatured: true,
    productCount: 248,
    subcategoryCount: 4,
    ...overrides,
  };
}

/** A subcategory — same shape, with `parentId` pointing at its parent. */
export function makeSubcategory(overrides: Partial<Category> = {}): Category {
  return makeCategory({
    id: 11,
    name: "Cameras",
    slug: "cameras",
    description: "Bodies, lenses and camera gear",
    icon: "camera",
    parentId: 1,
    sortOrder: 3,
    isFeatured: false,
    productCount: 64,
    subcategoryCount: 0,
    ...overrides,
  });
}

export function makeCategoryDetail(overrides: Partial<CategoryDetail> = {}): CategoryDetail {
  return { ...makeCategory(), parent: null, ...overrides };
}

/** A minimal listing card — the shared `ProductCardData` shape, never redefined. */
export function makeCategoryProduct(overrides: Partial<ProductCardData> = {}): ProductCardData {
  return {
    id: 101,
    slug: "sony-wh-1000xm5",
    title: "Sony WH-1000XM5",
    location: "Indiranagar, Bengaluru",
    categoryId: 1,
    categoryName: "Electronics",
    condition: "LIKE_NEW",
    listingType: "BOTH",
    status: "ACTIVE",
    purchasePrice: 2_990_000,
    rentalPricePerDay: 49_900,
    rentalPricePerWeek: 299_000,
    rentalPricePerMonth: 999_000,
    securityDeposit: 500_000,
    ratingAverage: 4.5,
    ratingCount: 12,
    favoriteCount: 7,
    viewCount: 120,
    primaryImage: "https://images.unsplash.com/photo-headphones",
    availableQuantity: 5,
    ...overrides,
  };
}
