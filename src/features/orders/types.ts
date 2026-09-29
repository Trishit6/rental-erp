/**
 * Order domain types.
 *
 * These mirror the server's order responses exactly. Two rules they encode:
 *
 *  - `OrderItem` carries `*Snapshot` fields. An order is a historical record, so
 *    the title, image and price are the ones captured when it was placed — never
 *    re-read from the live product, which may since have changed or been removed.
 *  - Nothing here includes a payment credential. `OrderPayment` has a method and
 *    a reference; there is no card number, no CVV and no provider secret in the
 *    type at all, so there is no field to leak by accident.
 */

/* --------------------------------- status ---------------------------------- */

/**
 * Fulfillment lifecycle. Kept as a union of known values, but the server stores
 * a `varchar`, so any consumer that renders a status must tolerate an unknown
 * one — see `describeStatus`.
 */
export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "PROCESSING",
  "READY_FOR_PICKUP",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number] | (string & {});

/** Statuses from before the lifecycle above existed. */
export const LEGACY_ORDER_STATUSES = ["PAID"] as const;

export const PAYMENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number] | (string & {});

export const RENTAL_STATUSES = [
  "CONFIRMED",
  "ACTIVE",
  "RETURN_PENDING",
  "OVERDUE",
  "DISPUTED",
  "RETURNED",
  "CANCELLED",
] as const;

export type RentalStatus = (typeof RENTAL_STATUSES)[number] | (string & {});

export const ORDER_TYPES = ["PURCHASE", "RENTAL", "MIXED"] as const;
export type OrderType = (typeof ORDER_TYPES)[number] | (string & {});

/** `RENT` means the customer is renting this line; it is never `RENT_AND_BUY`,
 *  which is a product capability rather than an order-line mode. */
export type OrderItemMode = "BUY" | "RENT";
export type DeliveryMethod = "DELIVERY" | "PICKUP";

/* ---------------------------------- money ---------------------------------- */

export type OrderAmounts = {
  subtotal: number;
  deliveryFee: number;
  depositTotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
};

/* --------------------------------- shared ---------------------------------- */

export type SellerSummary = {
  id: number;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
};

export type OrderItem = {
  /** Internal row id. Used as a React key only — never displayed. */
  id: number;
  productId: number;
  sellerId: number;
  mode: OrderItemMode;
  quantity: number;
  unitPrice: number;
  rentalCharge: number;
  securityDeposit: number;
  lineTotal: number;
  /** Displayed name, as captured at purchase time. */
  titleSnapshot: string;
  /** Snapshot image, falling back to the product's current image. */
  imageUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  rentalDays: number | null;
  rentCreditApplied: number;
  /** Live product fields, for linking and context. Null if the product is gone. */
  productSlug: string | null;
  condition: string | null;
  listingType: string | null;
};

export type OrderRental = {
  id: number;
  orderItemId: number;
  productId: number;
  startDate: string;
  endDate: string;
  actualReturnDate: string | null;
  dailyRate: number;
  rentalSubtotal: number;
  securityDeposit: number;
  rentCreditApplied: number;
  status: RentalStatus;
};

export type OrderPayment = {
  id: number;
  type: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  /** Safe provider reference. Never a credential. */
  providerTransactionId: string | null;
  paymentMethod: string | null;
  createdAt: string;
};

export type DeliveryAddress = {
  name?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

/* ---------------------------------- list ----------------------------------- */

export type OrderPreview = {
  title: string;
  imageUrl: string | null;
  mode: OrderItemMode;
};

export type OrderSummary = OrderAmounts & {
  id: number;
  /** The public `RV-2026-XXXXXX` identifier. Always prefer this over `id`. */
  orderNumber: string | null;
  orderType: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryMethod: DeliveryMethod;
  trackingNumber: string | null;
  createdAt: string;
  itemCount: number;
  preview: OrderPreview | null;
  sellers: SellerSummary[];
  /** The most actionable rental status across this order, if it has any. */
  rentalStatus: RentalStatus | null;
  rentalEndDate: string | null;
};

export type OrderListResponse = {
  orders: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/* --------------------------------- detail ---------------------------------- */

export type OrderDetail = OrderAmounts & {
  id: number;
  orderNumber: string | null;
  orderType: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryMethod: DeliveryMethod;
  deliveryAddressSnapshot: DeliveryAddress | null;
  trackingNumber: string | null;
  paymentProvider: string;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderDetailsResponse = {
  order: OrderDetail;
  items: OrderItem[];
  rentals: OrderRental[];
  payment: OrderPayment | null;
  payments: OrderPayment[];
  sellers: SellerSummary[];
};

/* -------------------------------- timeline --------------------------------- */

/**
 * A verified point in the order's history.
 *
 * Built on the client from fields the server actually stores. `at` is null when
 * a step has happened conceptually but no timestamp exists for it — a step must
 * never be given an invented time to make the timeline look fuller.
 */
export type OrderTimelineEvent = {
  key: string;
  label: string;
  description?: string;
  at: string | null;
  state: "done" | "current" | "pending" | "failed" | "cancelled";
};

/* ---------------------------------- labels --------------------------------- */

export function orderTypeLabel(type: OrderType): string {
  switch (type) {
    case "PURCHASE":
      return "Purchase";
    case "RENTAL":
      return "Rental";
    case "MIXED":
      return "Rent & Buy";
    default:
      return String(type);
  }
}

/** `BUY`/`RENT` as a customer-facing word. */
export function itemModeLabel(mode: OrderItemMode): string {
  return mode === "RENT" ? "Rent" : "Buy";
}
