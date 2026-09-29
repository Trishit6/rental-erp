import type {
  OrderDetail,
  OrderDetailsResponse,
  OrderItem,
  OrderListResponse,
  OrderPayment,
  OrderRental,
  OrderSummary,
  SellerSummary,
} from "@/features/orders/types";

/** Shared order fixtures. Every amount is in paise. */

export function makeSeller(overrides: Partial<SellerSummary> = {}): SellerSummary {
  return {
    id: 2,
    name: "Priya",
    avatarUrl: null,
    verified: true,
    ...overrides,
  };
}

export function makeOrderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 11,
    orderNumber: "RV-2026-8F3K2A",
    orderType: "PURCHASE",
    status: "DELIVERED",
    paymentStatus: "PAID",
    subtotal: 499_900,
    deliveryFee: 4_900,
    depositTotal: 0,
    discount: 0,
    tax: 0,
    total: 504_800,
    currency: "INR",
    deliveryMethod: "DELIVERY",
    trackingNumber: null,
    createdAt: "2026-09-29T05:50:00.000Z",
    itemCount: 1,
    preview: { title: "Sony Headphones", imageUrl: null, mode: "BUY" },
    sellers: [makeSeller()],
    rentalStatus: null,
    rentalEndDate: null,
    ...overrides,
  };
}

export function makeRentalOrderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return makeOrderSummary({
    id: 12,
    orderNumber: "RV-2026-QW7T2M",
    orderType: "RENTAL",
    status: "CONFIRMED",
    subtotal: 35_000,
    deliveryFee: 0,
    depositTotal: 50_000,
    total: 85_000,
    deliveryMethod: "PICKUP",
    itemCount: 1,
    preview: { title: "Canon 200D DSLR", imageUrl: null, mode: "RENT" },
    rentalStatus: "ACTIVE",
    rentalEndDate: "2026-10-06T00:00:00.000Z",
    ...overrides,
  });
}

export function makeOrderListResponse(orders: OrderSummary[]): OrderListResponse {
  const pageSize = 10;
  return {
    orders,
    total: orders.length,
    page: 1,
    pageSize,
    totalPages: Math.max(1, Math.ceil(orders.length / pageSize)),
  };
}

export function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 101,
    productId: 30,
    sellerId: 2,
    mode: "BUY",
    quantity: 1,
    unitPrice: 499_900,
    rentalCharge: 0,
    securityDeposit: 0,
    lineTotal: 499_900,
    titleSnapshot: "Sony Headphones",
    imageUrl: null,
    startDate: null,
    endDate: null,
    rentalDays: null,
    rentCreditApplied: 0,
    productSlug: "sony-headphones",
    condition: "LIKE_NEW",
    listingType: "SALE",
    ...overrides,
  };
}

export function makeRentalItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return makeOrderItem({
    id: 102,
    productId: 31,
    mode: "RENT",
    unitPrice: 5_000,
    rentalCharge: 35_000,
    securityDeposit: 50_000,
    lineTotal: 85_000,
    titleSnapshot: "Canon 200D DSLR",
    startDate: "2026-09-29T00:00:00.000Z",
    endDate: "2026-10-06T00:00:00.000Z",
    rentalDays: 7,
    productSlug: "canon-200d",
    listingType: "RENT",
    ...overrides,
  });
}

export function makeOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 11,
    orderNumber: "RV-2026-8F3K2A",
    orderType: "PURCHASE",
    status: "DELIVERED",
    paymentStatus: "PAID",
    subtotal: 499_900,
    deliveryFee: 4_900,
    depositTotal: 0,
    discount: 0,
    tax: 0,
    total: 504_800,
    currency: "INR",
    deliveryMethod: "DELIVERY",
    deliveryAddressSnapshot: {
      name: "Asha",
      phone: "9876543210",
      addressLine1: "12 Fernhill Road",
      addressLine2: null,
      city: "Pune",
      state: "Maharashtra",
      postalCode: "411001",
      country: "India",
    },
    trackingNumber: null,
    paymentProvider: "mock",
    paymentReference: "mock_pay_abc",
    createdAt: "2026-09-29T05:50:00.000Z",
    updatedAt: "2026-09-29T05:55:00.000Z",
    ...overrides,
  };
}

export function makeRentalOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return makeOrderDetail({
    id: 12,
    orderNumber: "RV-2026-QW7T2M",
    orderType: "RENTAL",
    status: "CONFIRMED",
    subtotal: 35_000,
    deliveryFee: 0,
    depositTotal: 50_000,
    total: 85_000,
    deliveryMethod: "PICKUP",
    ...overrides,
  });
}

export function makePayment(overrides: Partial<OrderPayment> = {}): OrderPayment {
  return {
    id: 501,
    type: "PAYMENT",
    amount: 504_800,
    currency: "INR",
    status: "PAID",
    provider: "dev_mock",
    providerTransactionId: "mock_pay_9f3c2a",
    paymentMethod: "UPI",
    createdAt: "2026-09-29T05:51:00.000Z",
    ...overrides,
  };
}

export function makeRental(overrides: Partial<OrderRental> = {}): OrderRental {
  return {
    id: 61,
    orderItemId: 102,
    productId: 31,
    startDate: "2026-09-29T00:00:00.000Z",
    endDate: "2026-10-06T00:00:00.000Z",
    actualReturnDate: null,
    dailyRate: 5_000,
    rentalSubtotal: 35_000,
    securityDeposit: 50_000,
    rentCreditApplied: 0,
    status: "ACTIVE",
    ...overrides,
  };
}

export function makeOrderDetails(
  overrides: Partial<OrderDetailsResponse> = {},
): OrderDetailsResponse {
  const order = overrides.order ?? makeOrderDetail();
  return {
    order,
    items: [makeOrderItem()],
    rentals: [],
    payment: makePayment(),
    payments: [makePayment()],
    sellers: [makeSeller()],
    ...overrides,
  };
}

export function makeRentalOrderDetails(
  overrides: Partial<OrderDetailsResponse> = {},
): OrderDetailsResponse {
  return makeOrderDetails({
    order: makeRentalOrderDetail(),
    items: [makeRentalItem()],
    rentals: [makeRental()],
    payment: makePayment({ amount: 85_000, paymentMethod: "CARD" }),
    ...overrides,
  });
}
