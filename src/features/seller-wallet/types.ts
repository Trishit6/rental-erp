/**
 * Client types for the seller wallet.
 *
 * These mirror what `server/routes/wallet.ts` sends. Money is **integer paise** on
 * this side of the wire, exactly as everywhere else in Revaro, and is formatted with
 * `formatInr` only at the point of display.
 *
 * The server owns all of it: what counts as available, what is reserved, how long
 * settlement takes, the platform's fee, and the payout vocabulary. Nothing here
 * re-derives a balance. A wallet page that computed its own available balance would
 * disagree with the payout request the moment a second tab was open, and the seller
 * would be right to stop trusting it.
 */

/**
 * Mirrors `WALLET_TRANSACTION_TYPES` in `server/lib/wallet.ts`.
 *
 * Declared here rather than imported because a feature module must not reach into
 * server code, and because the union is what makes a component's `switch` exhaustive
 * — a type written by hand and forgotten by the server would fail to compile the
 * first time a new row type appeared.
 */
export const WALLET_TYPES = [
  "SALE",
  "RENTAL",
  "PLATFORM_FEE",
  "REFUND",
  "PAYOUT",
  "PAYOUT_REVERSAL",
  "ADJUSTMENT",
] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

/** Mirrors `PAYOUT_STATUSES`. A seller never chooses one of these. */
export const PAYOUT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/**
 * The filter chips.
 *
 * `all` is the absence of a type filter; `payouts` covers both directions of a
 * payout (`PAYOUT` and `PAYOUT_REVERSAL`) because "show me money leaving my wallet"
 * includes the memo explaining why one of them came back.
 */
export const WALLET_FILTERS = [
  "all",
  "sales",
  "rentals",
  "refunds",
  "fees",
  "payouts",
  "adjustments",
] as const;
export type WalletFilter = (typeof WALLET_FILTERS)[number];

export const WALLET_FILTER_LABELS: Record<WalletFilter, string> = {
  all: "All",
  sales: "Sales",
  rentals: "Rentals",
  refunds: "Refunds",
  fees: "Fees",
  payouts: "Payouts",
  adjustments: "Adjustments",
};

/**
 * Date windows, mirroring `WALLET_RANGES`.
 *
 * `today` is resolved **server-side against the seller's own offset** — see
 * `timezoneOffsetMinutes` on the overview response. A "Today" chip that quietly
 * meant UTC's today would be wrong for every seller not on Greenwich, and wrong by
 * enough to matter: at 20:00 in Kolkata, UTC has already rolled over.
 */
export const WALLET_RANGES = ["today", "7d", "30d", "90d", "ytd", "custom"] as const;
export type WalletRange = (typeof WALLET_RANGES)[number];

export const WALLET_RANGE_LABELS: Record<WalletRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "This year",
  custom: "Custom",
};

/**
 * The four figures the wallet leads with, plus the lifetime context.
 *
 * `availablePaise` is the only one a request may draw on, and it already has the
 * reserved and paid-out payouts subtracted by the server. A client that added those
 * up again would double-count every payout.
 */
export type WalletBalance = {
  /** Released earnings minus everything reserved or already paid out. */
  availablePaise: number;
  /** Earned, not yet past the settlement delay. Not requestable. */
  pendingPaise: number;
  /** Held by payouts an admin has not resolved. */
  reservedPaise: number;
  lifetimeEarnedPaise: number;
  lifetimeFeesPaise: number;
  lifetimeRefundsPaise: number;
  lifetimePaidOutPaise: number;
  currency: string;
};

export type WalletBreakdownRow = {
  type: WalletType;
  count: number;
  /** Signed, so a credit and a debit are never presented as comparable. */
  amountPaise: number;
};

export type WalletSeriesPoint = {
  /** `YYYY-MM-DD`, or `YYYY-MM-01` for a long window. Already in the seller's zone. */
  date: string;
  salePaise: number;
  rentalPaise: number;
  feePaise: number;
  refundPaise: number;
  payoutPaise: number;
};

export type WalletOverview = {
  balance: WalletBalance;
  breakdown: WalletBreakdownRow[];
  series: WalletSeriesPoint[];
  range: {
    range: WalletRange;
    from: string;
    to: string;
    bucket: "day" | "month";
    /**
     * The offset the window was cut with, echoed so the UI can say which "today"
     * it is showing rather than leaving the seller to wonder.
     */
    timezoneOffsetMinutes: number;
  };
  /**
   * Sent rather than hardcoded in React, so the request form's floor and the page's
   * explanation of the settlement delay cannot drift from what the server enforces.
   */
  limits: {
    minimumPayoutPaise: number;
    settlementDelayDays: number;
    currency: string;
  };
};

export type WalletTransaction = {
  id: number;
  type: WalletType;
  /** Signed paise. The sign is the point — never formatted as a magnitude. */
  amount: number;
  status: string;
  /** One sentence, written by the server. Never by a client. */
  description: string;
  /** `RV-…`, `PAY-…` or a product title. Never the auto-increment id. */
  reference: string | null;
  orderId: number | null;
  orderItemId: number | null;
  rentalId: number | null;
  payoutId: number | null;
  createdAt: string;
};

export type WalletPayout = {
  id: number;
  payoutNumber: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  methodId: number | null;
  /** The masked label as it stood when the payout was requested. */
  methodLabel: string;
  note: string | null;
  /** Only ever set on a refusal, and written for the seller to read. */
  failureReason: string | null;
  requestedAt: string;
  processingAt: string | null;
  completedAt: string | null;
};

/**
 * `created` distinguishes a new request from a retried one.
 *
 * The server answers a repeated idempotency key with `200` and the existing payout
 * rather than a second reservation, so the client must be able to tell — otherwise a
 * double-clicked button shows two success toasts for one payout.
 */
export type RequestPayoutResult = {
  payout: WalletPayout;
  created: boolean;
  balance: WalletBalance;
};

export type PayoutMethod = {
  id: number;
  type: "BANK" | "UPI";
  accountHolder: string;
  /** Seller-supplied and already masked. There is no unmasked field to leak. */
  maskedLabel: string;
  isDefault: boolean;
  createdAt: string;
};

/** Everything the wallet page puts in the URL. */
export type WalletParams = {
  filter: WalletFilter;
  range: WalletRange;
  from?: string;
  to?: string;
  search: string;
  page: number;
};
