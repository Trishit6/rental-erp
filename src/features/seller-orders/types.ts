/**
 * Client types for the seller's order desk — `/seller/orders`.
 *
 * These mirror the JSON `server/lib/seller-order-queries.ts` builds. Every money
 * value is **integer paise**, formatted with `formatInr` only at the point of
 * display, and every figure is computed by the database. This module never
 * re-derives a subtotal or a rollup: a page that computes its own "pending"
 * count is a page that eventually disagrees with the tab above it.
 */

/* ------------------------------- vocabulary -------------------------------- */

/**
 * The status tabs, in lifecycle order.
 *
 * Mirrors `SELLER_ORDER_STATUS_FILTERS` in `server/lib/seller-order-queries.ts`.
 * `CONFIRMED` leads because that is where a paid order sits before the seller
 * touches it — a line the seller has not acted on inherits the order's status.
 * A drift test (`tests/seller-orders-page.test.ts`) keeps the two lists equal.
 */
export const SELLER_ORDER_STATUS_FILTERS = [
  "CONFIRMED",
  "PROCESSING",
  "READY_FOR_PICKUP",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type SellerOrderStatusFilter = (typeof SELLER_ORDER_STATUS_FILTERS)[number];

/** The tabs the page shows, with `ALL` as the "no filter" tab up front. */
export const SELLER_ORDER_STATUS_TABS = ["ALL", ...SELLER_ORDER_STATUS_FILTERS] as const;
export type SellerOrderStatusTab = (typeof SELLER_ORDER_STATUS_TABS)[number];

export const SELLER_ORDER_SORTS = ["newest", "oldest", "total_desc", "total_asc"] as const;
export type SellerOrderSort = (typeof SELLER_ORDER_SORTS)[number];

export const SELLER_ORDER_SORT_LABELS: Record<SellerOrderSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  total_desc: "Highest value",
  total_asc: "Lowest value",
};

/**
 * The steps a seller can set, and what each one reads as.
 *
 * `SELLER_FULFILLMENT_STATES` on the server excludes the order lifecycle values
 * (`PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`) because a seller never *sets*
 * those — but the tabs and badges must render them, so the label map covers the
 * whole vocabulary.
 */
export const FULFILLMENT_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  READY_FOR_PICKUP: "Ready for pickup",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function fulfillmentLabel(status: string): string {
  return FULFILLMENT_LABELS[status] ?? status;
}

/**
 * Payment states, mirrored from `SELLER_PAYMENT_STATUSES` on the server.
 *
 * A seller never *sets* these — money is not theirs to move — but the order desk
 * shows the state so a seller knows whether an order is safe to work.
 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partly refunded",
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

/**
 * The transition table, mirrored from `server/lib/order-fulfillment.ts`.
 *
 * The server is authoritative and re-validates every step, so this copy exists
 * only to *offer* the right buttons without a round-trip per row. It is kept in
 * step by a drift test rather than by hope: `tests/seller-orders-page.test.ts`
 * walks both tables and fails the moment they disagree.
 */
export const SELLER_NEXT_STATES: Record<string, readonly string[]> = {
  PENDING_PAYMENT: [],
  CONFIRMED: ["PROCESSING"],
  PROCESSING: ["READY_FOR_PICKUP", "SHIPPED"],
  READY_FOR_PICKUP: ["SHIPPED", "DELIVERED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * The steps every order in a selection may take, most-advanced-first order
 * preserved.
 *
 * A bulk action applies **one** target to every selected order and the server
 * validates each line, so a step is offerable only when all of them allow it —
 * the intersection. `null` in the input (a line the seller never touched) is
 * omitted by the caller, which resolves the effective status first.
 */
export function commonNextStates(statuses: readonly string[]): string[] {
  if (statuses.length === 0) return [];
  let intersection: string[] | null = null;
  for (const status of statuses) {
    const next = SELLER_NEXT_STATES[status] ?? [];
    intersection = intersection === null ? [...next] : intersection.filter((s) => next.includes(s));
  }
  return intersection ?? [];
}

/* --------------------------------- shapes ---------------------------------- */

export type SellerOrderSummary = {
  id: number;
  orderNumber: string | null;
  /** The order's own status. */
  status: string;
  /** The seller's rollup across their own lines — what the tabs are built from. */
  fulfillmentStatus: string;
  paymentStatus: string;
  itemCount: number;
  unitCount: number;
  /** From this seller's `order_items.line_total`, never the whole order total. */
  sellerSubtotal: number;
  currency: string;
  deliveryMethod: string;
  createdAt: string;
  customerName: string | null;
  canCancel: boolean;
};

export type SellerOrderLine = {
  id: number;
  productId: number;
  productSlug: string | null;
  title: string;
  imageUrl: string | null;
  condition: string | null;
  mode: string;
  quantity: number;
  unitPrice: number;
  rentalCharge: number;
  securityDeposit: number;
  lineTotal: number;
  fulfillmentStatus: string;
  startDate: string | null;
  endDate: string | null;
  rentalDays: number | null;
};

export type SellerOrderDelivery = {
  method: string;
  address: {
    name: string | null;
    phone: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
};

export type SellerOrderTimelineEntry = {
  key: string;
  label: string;
  at: string | null;
  state: string;
};

export type SellerOrderDetail = {
  order: SellerOrderSummary & {
    paymentProvider: string;
    paymentReference: string | null;
    placedAt: string;
  };
  /** Only this seller's lines. Never the whole order. */
  items: SellerOrderLine[];
  delivery: SellerOrderDelivery;
  customer: { name: string | null; phone: string | null };
  timeline: SellerOrderTimelineEntry[];
  actions: { next: string[]; canCancel: boolean; canSetFulfillment: boolean };
};

/* --------------------------------- requests -------------------------------- */

export type SellerOrdersFilters = {
  page: number;
  pageSize: number;
  search: string;
  status: SellerOrderStatusTab;
  sort: SellerOrderSort;
};

export const DEFAULT_SELLER_ORDERS_FILTERS: SellerOrdersFilters = {
  page: 1,
  pageSize: 20,
  search: "",
  status: "ALL",
  sort: "newest",
};

/** The payload a bulk fulfilment applies, once the undo window has elapsed. */
export type BulkFulfillmentPayload = {
  references: string[];
  status: string;
};
