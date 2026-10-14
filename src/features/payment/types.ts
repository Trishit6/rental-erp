/**
 * Payment feature types.
 *
 * Every shape here mirrors a server response exactly. `PaymentBreakdown` in
 * particular is the server's own arithmetic — the client never derives an
 * amount, it only renders one. Keeping the breakdown explicit (rather than a
 * single `total`) is what lets the UI show rental charges and security deposits
 * as the separate things they are, instead of one number the customer has to
 * trust blindly.
 */

export const PAYMENT_METHODS = ["UPI", "CARD", "NET_BANKING", "WALLET"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** True once polling must stop: nothing further will change. */
export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return TERMINAL_PAYMENT_STATUSES.includes(status);
}

export type PaymentMethodDescriptor = {
  method: PaymentMethod;
  label: string;
  description: string;
  metadata?: Record<string, string>;
};

export type PaymentProviderInfo = {
  provider: string;
  /**
   * False for the development mock. When false the UI must say so plainly —
   * a development payment must never be dressed up as a real one.
   */
  isProductionReady: boolean;
  currency: string;
  methods: PaymentMethodDescriptor[];
  isDevelopmentMock: boolean;
};

/** One priced line, exactly as the server computed it. */
export type PaymentLine = {
  cartItemId: number;
  productId: number;
  sellerId: number;
  title: string;
  imageUrl: string | null;
  mode: "BUY" | "RENT";
  quantity: number;
  startDate: string | null;
  endDate: string | null;
  rentalDays: number | null;
  listingType: string;
  pricing: {
    unitPrice: number;
    lineTotal: number;
    rentalCharge: number;
    securityDeposit: number;
    depositTotal: number;
    days: number;
  };
};

export type PaymentIssueCode =
  | "PRODUCT_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "QUANTITY_UNAVAILABLE"
  | "RENTAL_UNAVAILABLE"
  | "MODE_UNSUPPORTED"
  | "OWN_LISTING";

export type PaymentIssue = {
  code: PaymentIssueCode;
  message: string;
  field?: "quantity" | "listingType" | "rentalDuration" | "price";
  previousValue?: string;
  currentValue?: string;
};

export type PaymentAddress = {
  id: number;
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type PaymentBreakdown = {
  /** Purchases + rental charges. Excludes deposits. */
  subtotal: number;
  /** The rental portion of `subtotal`. Zero for a pure purchase. */
  rentalAmount: number;
  /** Refundable, held separately. Never seller revenue. */
  securityDeposit: number;
  deliveryFee: number;
  discount: number;
  tax: number;
  grandTotal: number;
  currency: string;
};

export type PaymentSummary = {
  lines: PaymentLine[];
  breakdown: PaymentBreakdown;
  issues: PaymentIssue[];
  /** The coupon a supplied code resolved to, or null. */
  coupon: AppliedCoupon | null;
  /** Why a supplied code did nothing. Null when there was no code, or it worked. */
  couponIssue: { code: string; message: string } | null;
  isPayable: boolean;
  deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryAddressId: number | null;
  deliveryAddress: PaymentAddress | null;
  currency: string;
  provider: string;
  isProductionReady: boolean;
};

/** A coupon the server accepted for this cart. The client only displays it. */
export type AppliedCoupon = {
  id: number;
  code: string;
  discountPaise: number;
};

/** The answer to "does this code work on my cart?", from `POST /payments/coupon`. */
export type CouponPreview = {
  code: string;
  applied: boolean;
  discountPaise: number;
  /** The reason a code did not apply, or null when it did. */
  message: string | null;
  breakdown: PaymentBreakdown;
};

export type PaymentIntent = {
  transactionId: number;
  provider: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  isProductionReady: boolean;
  /** False once the intent is settled — it must not be paid a second time. */
  resumable: boolean;
  /**
   * The UPI collect code, when this is a UPI intent and the deployment has a payee
   * VPA configured. Rendering it is a courtesy to a customer who prefers to scan;
   * it is never treated as evidence that money moved.
   */
  upi?: UpiPayment;
};

/**
 * A server-built UPI collect request. Mirrors `server/lib/payments/upi.ts`.
 *
 * Every field is a fact the server decided: the amount is the transaction's own,
 * the reference is the row id, and the VPA is the deployment's. The client only
 * displays them — nothing here is editable, and nothing here confirms a payment.
 */
export type UpiPayment = {
  payload: string;
  imageDataUrl: string;
  payeeVpa: string;
  payeeName: string;
  /** Exact amount in integer paise, matching the transaction. */
  amount: number;
  currency: string;
  reference: string;
  note: string;
};

export type PaymentStatusResponse = {
  transactionId: number;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod | null;
  orderId: number | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  /** Same collect code as the intent, so a reloaded page can still show it. */
  upi?: UpiPayment;
};

/** The safe order confirmation. No provider credentials, no internal ids. */
export type OrderConfirmation = {
  orderId: number;
  /** The customer-facing `RV-2026-XXXXXX`. Never the auto-increment id. */
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  currency: string;
  rentalCount: number;
  /** False when an existing order was returned rather than a new one created. */
  created: boolean;
  transactionId?: number;
};

export type CreateIntentInput = {
  deliveryMethod: "DELIVERY" | "PICKUP";
  deliveryAddressId: number | null;
  paymentMethod: PaymentMethod;
  /** The code the customer applied, if any. Re-validated server-side; never an amount. */
  couponCode?: string | null;
  idempotencyKey: string;
};

export type VerifyPaymentInput = {
  /**
   * No amount, no status, no success flag — the server asks the provider what
   * happened and that is the only answer it acts on.
   */
  paymentMethod?: PaymentMethod;
};

/** Error codes the payment API can return, for branching in the UI. */
export const PAYMENT_ERROR_CODES = {
  PAYMENT_AMOUNT_CHANGED: "PAYMENT_AMOUNT_CHANGED",
  CART_UNAVAILABLE: "CART_UNAVAILABLE",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  PAYMENT_CANCELLED: "PAYMENT_CANCELLED",
  PAYMENT_ALREADY_SETTLED: "PAYMENT_ALREADY_SETTLED",
  PAYMENT_NOT_CONFIGURED: "PAYMENT_NOT_CONFIGURED",
  EMPTY_CART: "EMPTY_CART",
  ADDRESS_REQUIRED: "ADDRESS_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
} as const;

/**
 * True when the failure is "your amount moved, look again" rather than "try
 * again" — these two need different buttons, and lumping them together is how
 * a customer ends up retrying a payment that can never succeed.
 */
export function isReviewRequired(code: string): boolean {
  return (
    code === PAYMENT_ERROR_CODES.PAYMENT_AMOUNT_CHANGED ||
    code === PAYMENT_ERROR_CODES.CART_UNAVAILABLE ||
    code === PAYMENT_ERROR_CODES.EMPTY_CART ||
    code === PAYMENT_ERROR_CODES.ADDRESS_REQUIRED
  );
}
