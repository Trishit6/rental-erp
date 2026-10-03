import type {
  Rental,
  RentalDetailsResponse,
  RentalExtensionQuote,
  RentalListResponse,
  RentalTimelineEvent,
} from "@/features/rentals/types";

/** Shared rental fixtures. Every amount is in paise; every date is an ISO day. */

export function makeRental(overrides: Partial<Rental> = {}): Rental {
  return {
    id: 61,
    orderId: 12,
    orderNumber: "RV-2026-QW7T2M",
    productId: 31,
    renterId: 1,
    ownerId: 2,
    status: "ACTIVE",
    bucket: "active",
    isInHand: true,
    depositStatus: "HELD",
    rentCreditApplied: 0,
    returnRequestedAt: null,
    completedAt: null,
    extensionRequestedAt: null,
    extensionRequestedDays: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    startDate: "2026-09-29T00:00:00.000Z",
    endDate: "2026-10-06T00:00:00.000Z",
    actualReturnDate: null,
    days: 7,
    daysRemaining: 5,
    dailyRate: 5_000,
    rentalSubtotal: 35_000,
    securityDeposit: 50_000,
    deliveryFee: 0,
    total: 85_000,
    title: "Canon 200D DSLR",
    productSlug: "canon-200d",
    condition: "LIKE_NEW",
    listingType: "RENT",
    primaryImage: null,
    orderItemTitle: "Canon 200D DSLR",
    orderItemImage: null,
    deliveryMethod: "PICKUP",
    ownerName: "Priya",
    ownerAvatarUrl: null,
    ownerVerified: true,
    ...overrides,
  };
}

export function makeUpcomingRental(overrides: Partial<Rental> = {}): Rental {
  return makeRental({
    id: 62,
    status: "CONFIRMED",
    bucket: "upcoming",
    isInHand: false,
    startDate: "2026-11-01T00:00:00.000Z",
    endDate: "2026-11-08T00:00:00.000Z",
    daysRemaining: 0,
    ...overrides,
  });
}

export function makeReturnedRental(overrides: Partial<Rental> = {}): Rental {
  return makeRental({
    id: 63,
    status: "RETURNED",
    bucket: "completed",
    isInHand: false,
    depositStatus: "RELEASE_PENDING",
    actualReturnDate: "2026-10-05T00:00:00.000Z",
    daysRemaining: 0,
    ...overrides,
  });
}

export function makeRentalListResponse(rentals: Rental[]): RentalListResponse {
  const pageSize = 10;
  return {
    rentals,
    total: rentals.length,
    page: 1,
    pageSize,
    totalPages: Math.max(1, Math.ceil(rentals.length / pageSize)),
  };
}

export function makeTimeline(events: Partial<RentalTimelineEvent>[] = []): RentalTimelineEvent[] {
  return events.map((event, index) => ({
    key: `event-${index}`,
    label: "Step",
    at: null,
    state: "pending" as const,
    ...event,
  }));
}

export function makeRentalDetails(
  overrides: Partial<RentalDetailsResponse> = {},
): RentalDetailsResponse {
  const rental = overrides.rental ?? makeRental();
  return {
    rental,
    seller: { id: 2, name: "Priya", avatarUrl: null, verified: true },
    delivery: { method: "PICKUP", address: null },
    timeline: makeTimeline([
      {
        key: "confirmed",
        label: "Rental confirmed",
        at: "2026-09-20T10:00:00.000Z",
        state: "done",
      },
      { key: "started", label: "Rental started", state: "done" },
      { key: "return-requested", label: "Return requested", state: "pending" },
      { key: "returned", label: "Returned", state: "pending" },
      { key: "completed", label: "Completed", state: "pending" },
    ]),
    eligibility: { canExtend: true, canRequestReturn: true, canCancel: false },
    orderStatus: "CONFIRMED",
    paymentStatus: "PAID",
    orderItemMode: "RENT",
    orderItemQuantity: 1,
    orderItemRentalDays: 7,
    updatedAt: "2026-09-29T10:00:00.000Z",
    ...overrides,
  };
}

export function makeExtensionQuote(
  overrides: Partial<RentalExtensionQuote> = {},
): RentalExtensionQuote {
  return {
    requested: true,
    additionalDays: 3,
    currentEndDate: "2026-10-06T00:00:00.000Z",
    proposedEndDate: "2026-10-09T00:00:00.000Z",
    additionalCost: 15_000,
    currency: "INR",
    status: "ACTIVE",
    requestedAt: "2026-10-01T09:00:00.000Z",
    ...overrides,
  };
}
