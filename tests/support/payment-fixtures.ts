import type {
  OrderConfirmation,
  PaymentIntent,
  PaymentProviderInfo,
  PaymentSummary,
} from "@/features/payment/types";

/** Shared payment fixtures. Every amount is in paise. */

export function makePaymentLine(
  overrides: Partial<PaymentSummary["lines"][number]> = {},
): PaymentSummary["lines"][number] {
  return {
    cartItemId: 1,
    productId: 10,
    sellerId: 2,
    title: "Vintage leather sofa",
    imageUrl: null,
    mode: "BUY",
    quantity: 1,
    startDate: null,
    endDate: null,
    rentalDays: null,
    listingType: "SALE",
    pricing: {
      unitPrice: 2_990_000,
      lineTotal: 2_990_000,
      rentalCharge: 0,
      securityDeposit: 0,
      depositTotal: 0,
      days: 0,
    },
    ...overrides,
  };
}

export function makeRentalLine(
  overrides: Partial<PaymentSummary["lines"][number]> = {},
): PaymentSummary["lines"][number] {
  return makePaymentLine({
    cartItemId: 2,
    title: "Canon 200D DSLR",
    mode: "RENT",
    listingType: "BOTH",
    quantity: 1,
    startDate: "2026-03-01",
    endDate: "2026-03-08",
    rentalDays: 7,
    pricing: {
      unitPrice: 50_000,
      lineTotal: 400_000,
      rentalCharge: 350_000,
      securityDeposit: 50_000,
      depositTotal: 50_000,
      days: 7,
    },
    ...overrides,
  });
}

export function makePaymentSummary(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  const lines = overrides.lines ?? [makePaymentLine()];
  const subtotal = lines.reduce((sum, l) => sum + l.pricing.lineTotal - l.pricing.depositTotal, 0);
  const rentalAmount = lines.reduce((sum, l) => sum + l.pricing.rentalCharge, 0);
  const securityDeposit = lines.reduce((sum, l) => sum + l.pricing.depositTotal, 0);
  const deliveryFee = 4_900;

  return {
    lines,
    issues: [],
    isPayable: true,
    deliveryMethod: "DELIVERY",
    deliveryAddressId: 4,
    deliveryAddress: {
      id: 4,
      name: "Asha",
      phone: "9876543210",
      addressLine1: "12 Fernhill Road",
      addressLine2: null,
      city: "Pune",
      state: "Maharashtra",
      postalCode: "411001",
      country: "India",
    },
    currency: "INR",
    provider: "dev_mock",
    isProductionReady: false,
    breakdown: {
      subtotal,
      rentalAmount,
      securityDeposit,
      deliveryFee,
      discount: 0,
      tax: 0,
      grandTotal: subtotal + securityDeposit + deliveryFee,
      currency: "INR",
    },
    ...overrides,
  } as PaymentSummary;
}

export function makePaymentProviderInfo(
  overrides: Partial<PaymentProviderInfo> = {},
): PaymentProviderInfo {
  return {
    provider: "dev_mock",
    isProductionReady: false,
    currency: "INR",
    isDevelopmentMock: true,
    methods: [
      { method: "UPI", label: "UPI", description: "Pay securely using UPI" },
      { method: "CARD", label: "Card", description: "Credit / Debit Card" },
    ],
    ...overrides,
  };
}

export function makePaymentIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    transactionId: 7,
    provider: "dev_mock",
    providerPaymentId: "mock_pay_abc",
    amount: 2_994_900,
    currency: "INR",
    status: "PENDING",
    isProductionReady: false,
    resumable: true,
    ...overrides,
  };
}

export function makeOrderConfirmation(
  overrides: Partial<OrderConfirmation> = {},
): OrderConfirmation {
  return {
    orderId: 12,
    orderNumber: "RV-2026-8F3K2A",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    total: 2_994_900,
    currency: "INR",
    rentalCount: 0,
    created: true,
    ...overrides,
  };
}
