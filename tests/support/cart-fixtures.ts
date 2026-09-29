import type {
  Cart,
  CartItem,
  CartItemProduct,
  CartTotals,
  PurchaseCartItem,
  RentalCartItem,
} from "@/features/cart/types";

/** A cart product exactly as `GET /api/cart` embeds it. */
export function makeCartProduct(overrides: Partial<CartItemProduct> = {}): CartItemProduct {
  return {
    id: 1,
    slug: "sony-wh-1000xm5",
    title: "Sony WH-1000XM5",
    location: "Bengaluru",
    condition: "LIKE_NEW",
    listingType: "BOTH",
    status: "ACTIVE",
    categoryId: 1,
    purchasePrice: 2_990_000,
    rentalPricePerDay: 49_900,
    rentalPricePerWeek: 299_000,
    rentalPricePerMonth: 999_000,
    securityDeposit: 500_000,
    minimumRentalDays: 1,
    maximumRentalDays: 30,
    quantity: 5,
    availableQuantity: 5,
    sellerId: 7,
    primaryImage: "https://example.com/headphones-1.jpg",
    sellerName: "Priya",
    sellerAvatarUrl: null,
    sellerVerified: true,
    ...overrides,
  };
}

const baseItem = {
  id: 10,
  productId: 1,
  quantity: 1,
  startDate: null,
  endDate: null,
  savedForLater: false,
  product: makeCartProduct(),
  issues: [],
};

/** A purchase line. Pricing mirrors what `priceCartLine` would return. */
export function makePurchaseItem(overrides: Partial<PurchaseCartItem> = {}): PurchaseCartItem {
  // `in` rather than `??`, so a test can pass `product: null` to model a listing
  // that has been deleted (the server's left join finds nothing).
  const product = "product" in overrides ? (overrides.product ?? null) : makeCartProduct();
  const quantity = overrides.quantity ?? 1;
  const unitPrice = overrides.pricing?.unitPrice ?? product?.purchasePrice ?? 0;
  const lineTotal = overrides.pricing?.lineTotal ?? unitPrice * quantity;

  return {
    ...baseItem,
    ...overrides,
    product,
    quantity,
    mode: "BUY",
    listingType: "BUY",
    rentalDuration: 0,
    pricing: {
      unitPrice,
      lineTotal,
      rentalCharge: 0,
      securityDeposit: 0,
      depositTotal: 0,
      days: 0,
      ...overrides.pricing,
    },
  } as PurchaseCartItem;
}

/** A rental line for a given number of days. */
export function makeRentalItem(
  overrides: Partial<RentalCartItem> & { days?: number } = {},
): RentalCartItem {
  const product = "product" in overrides ? (overrides.product ?? null) : makeCartProduct();
  const days = overrides.days ?? overrides.rentalDuration ?? 7;
  const quantity = overrides.quantity ?? 1;
  const unitPrice = overrides.pricing?.unitPrice ?? product?.rentalPricePerDay ?? 0;
  const rentalCharge = overrides.pricing?.rentalCharge ?? unitPrice * days * quantity;
  const securityDeposit = overrides.pricing?.securityDeposit ?? product?.securityDeposit ?? 0;
  const depositTotal = overrides.pricing?.depositTotal ?? securityDeposit * quantity;

  return {
    ...baseItem,
    startDate: "2026-03-01T00:00:00.000Z",
    endDate: "2026-03-08T00:00:00.000Z",
    ...overrides,
    product,
    quantity,
    mode: "RENT",
    listingType: "RENT",
    rentalDuration: days,
    pricing: {
      unitPrice,
      lineTotal: rentalCharge + depositTotal,
      rentalCharge,
      securityDeposit,
      depositTotal,
      days,
      ...overrides.pricing,
    },
  } as RentalCartItem;
}

/** Totals derived the way the server derives them, from the given lines. */
export function totalsFor(items: CartItem[]): CartTotals {
  const active = items.filter((item) => !item.savedForLater);
  return {
    subtotal: active.reduce(
      (sum, i) => sum + (i.pricing.lineTotal - i.pricing.depositTotal),
      0,
    ),
    rentalCharges: active.reduce((sum, i) => sum + i.pricing.rentalCharge, 0),
    securityDeposits: active.reduce((sum, i) => sum + i.pricing.depositTotal, 0),
    estimatedTotal: active.reduce((sum, i) => sum + i.pricing.lineTotal, 0),
    itemCount: active.length,
    quantityCount: active.reduce((sum, i) => sum + i.quantity, 0),
  };
}

export function makeCart(items: CartItem[] = [], overrides: Partial<Cart> = {}): Cart {
  return { id: 1, items, totals: totalsFor(items), ...overrides };
}
