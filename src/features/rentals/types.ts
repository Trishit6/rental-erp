/**
 * Rental domain types.
 *
 * Two things these encode deliberately:
 *
 *  - `Rental.status` is the *server's* word for the state. The client never
 *    derives it from dates; `bucket` and `isInHand` are also server-supplied, so
 *    a countdown is a display convenience and cannot disagree with the API.
 *  - Every money field is the server's. `rentalSubtotal` and `securityDeposit`
 *    are reported separately and never summed client-side into a "total" that
 *    might not match what was paid.
 */

export const RENTAL_STATUSES = [
  "CONFIRMED",
  "ACTIVE",
  "RETURN_PENDING",
  "OVERDUE",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
] as const;

/**
 * Stored statuses. Widened with `(string & {})` because the column is a
 * `varchar`: a status a future release writes must still render rather than
 * break the type, and every consumer handles an unknown one.
 */
export type RentalStatus = (typeof RENTAL_STATUSES)[number] | (string & {});

export const RENTAL_BUCKETS = ["upcoming", "active", "completed"] as const;
export type RentalBucket = (typeof RENTAL_BUCKETS)[number];

export const DEPOSIT_STATUSES = ["HELD", "RELEASE_PENDING", "RELEASED", "ADJUSTED"] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number] | (string & {});

export const RENTAL_SORTS = ["newest", "oldest", "ending_soon", "starting_soon"] as const;
export type RentalSort = (typeof RENTAL_SORTS)[number];

export type RentalPricing = {
  dailyRate: number;
  rentalSubtotal: number;
  securityDeposit: number;
  deliveryFee: number;
  /** What was charged for this rental line, deposit included. */
  total: number;
  currency: string;
};

export type RentalDates = {
  startDate: string;
  endDate: string;
  actualReturnDate: string | null;
  /** Day count, computed server-side from the stored dates. */
  days: number;
  /** Whole days until the end date, server-computed; 0 once it has passed. */
  daysRemaining: number;
};

export type RentalProduct = {
  id: number;
  title: string;
  slug: string | null;
  condition: string | null;
  listingType: string | null;
  primaryImage: string | null;
  /** The name as it was when the order was placed, when available. */
  snapshotTitle: string | null;
};

export type RentalSeller = {
  id: number;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
};

export type RentalDelivery = {
  method: "DELIVERY" | "PICKUP";
  /** The address as it was at purchase time, never the current profile one. */
  address: {
    name?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string | null;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | null;
};

/** A rental as the list renders it. */
export type Rental = {
  id: number;
  orderId: number;
  orderNumber: string | null;
  productId: number;
  renterId: number;
  ownerId: number;
  status: RentalStatus;
  /** Server-derived tab. Never inferred from dates in the client. */
  bucket: RentalBucket;
  /** True while the item is with the customer or due back. */
  isInHand: boolean;
  depositStatus: DepositStatus | null;
  rentCreditApplied: number;
  returnRequestedAt: string | null;
  completedAt: string | null;
  extensionRequestedAt: string | null;
  extensionRequestedDays: number | null;
  createdAt: string;
  startDate: string;
  endDate: string;
  actualReturnDate: string | null;
  days: number;
  daysRemaining: number;
  dailyRate: number;
  rentalSubtotal: number;
  securityDeposit: number;
  deliveryFee: number;
  total: number;
  title: string;
  productSlug: string;
  condition: string | null;
  listingType: string | null;
  primaryImage: string | null;
  orderItemTitle: string | null;
  orderItemImage: string | null;
  deliveryMethod: "DELIVERY" | "PICKUP";
  /** Public owner fields, joined server-side so a card needs no extra request. */
  ownerName: string;
  ownerAvatarUrl: string | null;
  ownerVerified: boolean;
};

export type RentalTimelineEvent = {
  key: string;
  label: string;
  description?: string;
  /** Null when no timestamp exists for the step. Never invented. */
  at: string | null;
  state: "done" | "current" | "pending" | "failed" | "cancelled";
};

/** What the server says is possible right now, so the UI never guesses. */
export type RentalEligibility = {
  canExtend: boolean;
  canRequestReturn: boolean;
  canCancel: boolean;
};

export type RentalDetailsResponse = {
  rental: Rental;
  seller: RentalSeller | null;
  delivery: RentalDelivery;
  timeline: RentalTimelineEvent[];
  eligibility: RentalEligibility;
  orderStatus: string;
  paymentStatus: string;
  orderItemMode: string | null;
  orderItemQuantity: number | null;
  orderItemRentalDays: number | null;
  updatedAt: string;
};

export type RentalListResponse = {
  rentals: Rental[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** What the server computed for an extension. Nothing here came from the client. */
export type RentalExtensionQuote = {
  requested: boolean;
  additionalDays: number;
  currentEndDate: string;
  proposedEndDate: string;
  additionalCost: number;
  currency: string;
  status: RentalStatus;
  requestedAt: string;
};

export type RentalReturnRequestResult = {
  status: RentalStatus;
  requestedAt: string | null;
};

export type RentalExtensionRequest = { additionalDays: number };
export type RentalReturnRequest = { method: "DROP_OFF" | "PICKUP" };

/* --------------------------------- labels --------------------------------- */

export function rentalStatusLabel(status: RentalStatus): string {
  const known: Record<string, string> = {
    CONFIRMED: "Confirmed",
    UPCOMING: "Upcoming",
    ACTIVE: "Active",
    RETURN_PENDING: "Return requested",
    RETURNED: "Returned",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    OVERDUE: "Overdue",
    DISPUTED: "Disputed",
  };
  if (known[status]) return known[status];
  // An unfamiliar status still reads as words rather than blank.
  return String(status)
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function depositStatusLabel(status: DepositStatus | null): string {
  switch (status) {
    case "HELD":
      return "Held";
    case "RELEASE_PENDING":
      return "Release pending";
    case "RELEASED":
      return "Released";
    case "ADJUSTED":
      return "Adjusted";
    case null:
      return "None";
    default:
      return String(status);
  }
}
