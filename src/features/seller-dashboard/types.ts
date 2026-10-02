/**
 * Client types for the seller workspace.
 *
 * These mirror the JSON `server/routes/seller.ts` sends. Money is **integer
 * paise** everywhere on this side of the wire — the same convention as the rest
 * of the app — and is formatted with `formatInr` only at the point of display.
 *
 * The server owns all of it: the period of an analytics query, the fee
 * percentage, the definition of "revenue" (gross of nothing, net of refundable
 * deposits) and the rental tab buckets. Nothing here re-derives a total, because
 * a dashboard that computes its own arithmetic is a dashboard that eventually
 * disagrees with the earnings page.
 */

/**
 * `GET /api/seller/summary` — the dashboard's headline cards.
 *
 * Every figure is a `COUNT` or `SUM(CASE …)` computed server-side. The dashboard
 * used to fetch `/rentals?role=all` and count the array in the browser, which
 * downloaded every rental on *both* sides of the table to produce one number;
 * there is now no path that can produce a rental count without the database doing
 * it.
 *
 * "Pending" counts **lines**, not orders: an order is only as resolved as its
 * slowest line, and a seller with three lines and two shipped still has work
 * outstanding.
 */
export type SellerSummary = {
  products: {
    total: number;
    /** `PUBLISHED` + `OUT_OF_STOCK` — what a customer can actually see. */
    active: number;
    draft: number;
    paused: number;
    archived: number;
    outOfStock: number;
  };
  orders: {
    total: number;
    /** Lines still waiting on this seller to act. */
    pending: number;
    inProgress: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
  rentals: {
    total: number;
    active: number;
    upcoming: number;
    returnPending: number;
    overdue: number;
    completed: number;
  };
  earnings: {
    /** Lifetime, net of refundable deposits. Paise. */
    salePaise: number;
    rentalPaise: number;
    /** After the platform's configured commission. Paise. */
    saleNetPaise: number;
    rentalNetPaise: number;
    currency: string;
  };
  reviews: { average: number; count: number; awaitingReply: number };
};

/* ------------------------------- onboarding ------------------------------- */

/**
 * `GET /api/seller/onboarding` — answerable *before* you are a seller, which is
 * what lets the client offer onboarding rather than bouncing.
 */
export type SellerStatus = {
  isSeller: boolean;
  hasProfile: boolean;
  profile: {
    bio: string | null;
    location: string | null;
    responseRateHours: number | null;
  } | null;
};

/** `POST /api/seller/onboarding`. Idempotent, so a double-click is harmless. */
export type OnboardingPayload = {
  bio?: string;
  location?: string;
  responseRateHours?: number | null;
};

/* -------------------------------- analytics -------------------------------- */

export const ANALYTICS_PERIODS = ["7d", "30d", "90d", "ytd", "custom"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "This year",
  custom: "Custom range",
};

/**
 * What the "top listings" table is ranked by.
 *
 * Mirrors `TOP_PRODUCT_METRICS` in `server/lib/seller-analytics.ts`. The server
 * picks the tiebreak too, because "most revenue" and "most units" disagree about
 * ties and a client that re-sorted the list would show a different order from the
 * one the ranking was computed with.
 */
export const TOP_PRODUCT_METRICS = ["revenue", "units", "rating"] as const;
export type TopProductMetric = (typeof TOP_PRODUCT_METRICS)[number];

export const METRIC_LABELS: Record<TopProductMetric, string> = {
  revenue: "Earnings",
  units: "Units moved",
  rating: "Rating",
};

/** The date window. Resolved **server-side**, so a bookmark keeps its meaning. */
export type AnalyticsRange = {
  period: AnalyticsPeriod;
  from: string;
  to: string;
  bucket: "day" | "month";
};

/**
 * One point per bucket, with the two revenue sources kept apart.
 *
 * The server sends them separately because the *totals* combine them — a
 * pre-summed series would silently disagree with the headline figure whenever a
 * seller's income is mostly rental, which is exactly the seller who needs the
 * chart. Summing here is the only place the two are added together.
 */
export type AnalyticsSeriesPoint = {
  date: string;
  purchaseRevenuePaise: number;
  rentalRevenuePaise: number;
  orders: number;
  unitsSold: number;
};

export type AnalyticsProduct = {
  id: number;
  title: string;
  slug: string;
  primaryImage: string | null;
  listingType: string;
  status: string;
  revenuePaise: number;
  unitsSold: number;
  unitsRented: number;
  ratingAverage: number;
  ratingCount: number;
};

export type SellerAnalytics = {
  range: AnalyticsRange;
  totals: {
    revenuePaise: number;
    purchaseRevenuePaise: number;
    rentalRevenuePaise: number;
    orders: number;
    purchaseOrders: number;
    rentalBookings: number;
    unitsSold: number;
    unitsRented: number;
    averageRating: number;
    ratingCount: number;
  };
  series: AnalyticsSeriesPoint[];
  topProducts: AnalyticsProduct[];
};

/** The analytics request, minus the parts the server refuses to guess. */
export type AnalyticsParams = {
  period: AnalyticsPeriod;
  from?: string;
  to?: string;
  metric: TopProductMetric;
};

/* -------------------------------- earnings -------------------------------- */

export type SellerEarnings = {
  saleEarnings: number;
  rentalEarnings: number;
  /** After the platform's configured commission. Paise. */
  saleNet: number;
  rentalNet: number;
  pendingOrderCount: number;
  saleFeePercent: number;
  rentalFeePercent: number;
  currency: string;
};

export type SellerTransaction = {
  id: number;
  type: string;
  amount: number;
  status: string;
  /** ISO 8601. */
  createdAt: string;
  /** Row key only — **never rendered**. It is a row count, not an order id. */
  orderId: number | null;
  /** The public order reference, `RV-…`. `null` for a transaction with no order. */
  orderNumber: string | null;
};

/* -------------------------------- profile --------------------------------- */

export type SellerProfile = {
  userId: number;
  bio: string | null;
  location: string | null;
  responseRateHours: number | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * The **public** shopfront, `GET /api/sellers/:id`.
 *
 * Reached through `/api/sellers`, deliberately *outside* the seller-guarded
 * router: a visitor with no session reads this, so the absence of a guard is
 * visible in the route tree instead of being a flag on one handler.
 *
 * Note what it does **not** contain: no email, no phone, no response-rate
 * promise, no order ids. A shopfront is what a stranger is shown; anything the
 * seller has to reveal in order to transact belongs to a conversation, not a
 * public page.
 */
export type PublicSeller = {
  id: number;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  /** ISO 8601. */
  joinedAt: string;
  bio: string | null;
  listingCount: number;
  ratingAverage: number;
  ratingCount: number;
};

/* ------------------------------ rental filters ----------------------------- */

/**
 * The owner-side rental tab buckets.
 *
 * Reusing `/api/rentals?role=owner` rather than adding a seller-rentals endpoint:
 * that endpoint already filters, paginates and sends `bucket` / `isInHand` /
 * `daysRemaining` / `depositStatus` because the backend owns the rental lifecycle
 * (`server/lib/rental-lifecycle.ts`). A second endpoint would have to re-derive
 * those, and two derivations of "is this rental overdue" is two chances to
 * disagree with the order page.
 */
export const SELLER_RENTAL_TABS = [
  "all",
  "in_hand",
  "return_pending",
  "overdue",
  "completed",
  "cancelled",
] as const;
export type SellerRentalTab = (typeof SELLER_RENTAL_TABS)[number];

export const SELLER_RENTAL_TAB_LABELS: Record<SellerRentalTab, string> = {
  all: "All",
  in_hand: "With customers",
  return_pending: "Return requested",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
};