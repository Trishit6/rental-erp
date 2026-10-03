import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  orderItems,
  payouts,
  rentals,
  sellerPayoutMethods,
  users,
  walletTransactions,
} from "../schema";
import { HttpError } from "./api";
import { PLATFORM_RENTAL_FEE_PERCENT, PLATFORM_SALE_FEE_PERCENT } from "./config";
import { orderNumberSuffix } from "./payments/order-number";
import { platformFee } from "../../src/lib/pricing";

/**
 * The seller wallet.
 *
 * ## The browser is never the calculator
 *
 * Every figure this module produces is a `SUM` or a `COUNT` evaluated by MariaDB.
 * The client never multiplies a price by a fee percentage, never adds a ledger
 * column up, and never subtracts a payout from an earnings total — it renders what
 * arrives and formats it with `formatInr` at the last possible moment. That is not
 * a stylistic preference: a balance computed twice is a balance that eventually
 * disagrees with itself, and a seller who sees two different numbers for the same
 * money stops trusting both.
 *
 * ## Signed integer paise
 *
 * `wallet_transactions.amount` is a signed count of paise — credits positive,
 * debits negative — which is how the rest of Revaro stores money (`orders.subtotal`,
 * `order_items.line_total`). Because no amount is ever a float and never passes
 * through JavaScript arithmetic on its way to the screen, there is no rounding
 * step to get wrong. Balances are therefore literal `SUM(amount)` calls.
 *
 * ## `REVERSED` means "this row does not count"
 *
 * Reversal is the one place this module needs a precise meaning for a status, so:
 *
 *  - a row in `AVAILABLE` contributes to the available balance;
 *  - a row in `PENDING` contributes to the pending balance;
 *  - a row in `REVERSED` contributes to **nothing**.
 *
 * Unwinding an earning therefore does two things: it flips the original `SALE` /
 * `RENTAL` / `PLATFORM_FEE` rows to `REVERSED`, and it writes a new `REFUND` row
 * carrying the net. Neither half is redundant. The flipped rows are what make the
 * original credit stop counting; the `REFUND` row is the new fact that says when,
 * why, and how much — and it takes `REVERSED` itself when the original had not yet
 * settled, so an unwound pending earning contributes zero to both buckets. The
 * ledger stays append-only and the arithmetic stays a single `CASE` expression.
 *
 * ## A payout is a reservation, not a transfer
 *
 * Nothing here moves money. There is no payout provider wired up, so a payout's
 * `PAYOUT` ledger row counts against the available balance from the moment it is
 * requested — that *is* the reservation — and it keeps counting once an admin marks
 * it `COMPLETED`, because then the money really has left. Only a `FAILED` or
 * `CANCELLED` payout stops counting, and it is joined by a `PAYOUT_REVERSAL` memo
 * so the audit trail can say why. The reservation is a `SUM` over rows, never a
 * counter a client can nudge.
 *
 * ## Two serialisation guards on `requestPayout`
 *
 *  1. `payouts.idempotency_key` is unique, so a retried or double-clicked request
 *     returns the payout that already exists instead of reserving twice.
 *  2. The seller's `users` row is locked `FOR UPDATE` for the duration of the
 *     transaction, so two concurrent requests queue instead of both reading the
 *     same pre-reservation balance and both succeeding.
 *
 * With both in place the available balance is re-read *inside* the transaction and
 * the amount checked against it there. Nothing the client sends is trusted for it.
 */

/** Only what a recording function needs, so a transaction can be passed in. */
export type WalletExecutor = Pick<typeof db, "insert" | "select" | "update">;

/* -------------------------------- vocabulary ------------------------------- */

/**
 * What a ledger row represents.
 *
 * `SALE` and `RENTAL` are gross earnings and carry the refundable deposit-free
 * line value; the platform's cut is a separate `PLATFORM_FEE` debit rather than a
 * subtraction from them. Two rows instead of one netted row, because the seller
 * page shows gross and fee side by side — "you earned ₹2,000 and we kept ₹100" is
 * a statement that can be checked, where a single netted figure invites the
 * question and cannot answer it.
 */
export const WALLET_TRANSACTION_TYPES = [
  "SALE",
  "RENTAL",
  "PLATFORM_FEE",
  "REFUND",
  "PAYOUT",
  "PAYOUT_REVERSAL",
  "ADJUSTMENT",
] as const;

export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export function isWalletTransactionType(value: unknown): value is WalletTransactionType {
  return (
    typeof value === "string" && (WALLET_TRANSACTION_TYPES as readonly string[]).includes(value)
  );
}

/** Types that represent money earned, rather than a movement of it. */
export const EARNING_TYPES = ["SALE", "RENTAL", "PLATFORM_FEE", "REFUND", "ADJUSTMENT"] as const;
export type EarningType = (typeof EARNING_TYPES)[number];

/**
 * Statuses an **earning** row may hold.
 *
 * Deliberately *not* the payout vocabulary: "is this money withdrawable yet" and
 * "what is the admin doing about this request" are different questions, and
 * sharing one column's values between them is how a ledger starts claiming a
 * pending sale is being processed by somebody.
 */
export const EARNING_STATUSES = ["PENDING", "AVAILABLE", "REVERSED"] as const;
export type EarningStatus = (typeof EARNING_STATUSES)[number];

/** Statuses a **payout** row mirrors from the request it belongs to. */
export const PAYOUT_LEDGER_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type PayoutLedgerStatus = (typeof PAYOUT_LEDGER_STATUSES)[number];

export function isPayoutLedgerStatus(value: unknown): value is PayoutLedgerStatus {
  return typeof value === "string" && (PAYOUT_LEDGER_STATUSES as readonly string[]).includes(value);
}

/**
 * Assert that a status belongs to the vocabulary its type partitions.
 *
 * Returns the status typed, so a caller can write `assertWalletStatus(...)` inline
 * and use the value without a second cast. Throws rather than silently coercing:
 * a ledger that quietly accepts `PAYOUT` on a `SALE` row would report a balance
 * nobody can explain.
 *
 * ## `PAYOUT_REVERSAL` gets exactly one state, and that is not an oversight
 *
 * A reversal memo records that a reservation was released, so `COMPLETED` is the only
 * thing it can honestly be. It is deliberately *not* in the payout lifecycle even
 * though its type starts with `PAYOUT`: the request it refers to no longer exists in
 * any live state, and a memo saying "the payout is processing" would be asserting
 * that money is on its way — the exact claim this whole arrangement exists to
 * withhold until a human confirms it. It is also why the memo counts for nothing in
 * the balance. The release happened by the `PAYOUT` row leaving `PENDING`/`PROCESSING`,
 * so a row that both released the money and narrated it would hand it back twice.
 */
export function assertWalletStatus(
  type: WalletTransactionType,
  status: string,
): EarningStatus | PayoutLedgerStatus {
  if (type === "PAYOUT_REVERSAL") {
    if (status === "COMPLETED") return "COMPLETED";
    throw new HttpError(
      400,
      "INVALID_WALLET_STATUS",
      `A payout reversal is a settled fact and cannot be ${status.toLowerCase().replace(/_/g, " ")}.`,
    );
  }

  const payoutRow = type === "PAYOUT";
  const allowed: readonly string[] = payoutRow ? PAYOUT_LEDGER_STATUSES : EARNING_STATUSES;
  if (allowed.includes(status)) {
    return status as EarningStatus | PayoutLedgerStatus;
  }
  throw new HttpError(
    400,
    "INVALID_WALLET_STATUS",
    payoutRow
      ? `A payout row cannot be ${status.toLowerCase().replace(/_/g, " ")}.`
      : `An earning row cannot be ${status.toLowerCase().replace(/_/g, " ")}.`,
  );
}

/** The lifecycle of a payout request, which only an admin advances. */
export const PAYOUT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export function isPayoutStatus(value: unknown): value is PayoutStatus {
  return typeof value === "string" && (PAYOUT_STATUSES as readonly string[]).includes(value);
}

/**
 * Payout transitions.
 *
 * Terminal states are terminal: a `COMPLETED` payout has no outgoing edges, so a
 * replayed request or a stale admin tab cannot walk a finished payment backwards
 * into a state that would silently re-reserve the money.
 *
 * There is deliberately **no** edge from `PENDING` straight to `COMPLETED`. Marking
 * a request paid in one step is exactly the "show a green tick before anything has
 * paid it" failure this whole module is arranged to prevent; an admin who is
 * actually transferring money picks up the request and then marks it done.
 */
const PAYOUT_TRANSITIONS: Record<PayoutStatus, readonly PayoutStatus[]> = {
  PENDING: ["PROCESSING", "FAILED", "CANCELLED"],
  PROCESSING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function allowedPayoutTransitions(status: PayoutStatus): PayoutStatus[] {
  return [...(PAYOUT_TRANSITIONS[status] ?? [])];
}

export function assertPayoutTransition(current: PayoutStatus, target: PayoutStatus): void {
  if (current === target) {
    throw new HttpError(409, "INVALID_TRANSITION", "This payout is already there.");
  }
  if ((PAYOUT_TRANSITIONS[current] ?? []).includes(target)) return;

  throw new HttpError(
    409,
    "INVALID_TRANSITION",
    (PAYOUT_TRANSITIONS[current] ?? []).length === 0
      ? `This payout is ${current.toLowerCase()} and can no longer be changed.`
      : `A ${current.toLowerCase()} payout cannot be marked ${target.toLowerCase()}.`,
  );
}

/* --------------------------------- settings -------------------------------- */

/**
 * Days between an earning being recorded and the money becoming withdrawable.
 *
 * The earning is recorded at the moment the item reaches the customer, which is
 * *not* the moment a seller can safely spend the money: a buyer who returns
 * something in the first two days has to be refundable out of the balance the
 * seller is about to withdraw. Three days is the settlement window this app's
 * refund path assumes, and it is deliberately a constant rather than a per-seller
 * or per-method value — a number the database would have to justify changing.
 */
export const SETTLEMENT_DELAY_DAYS = 3;

/**
 * Smallest payout accepted, in paise (₹500).
 *
 * There is no provider, so there is no provider fee schedule, but there *is* a
 * real cost to hand-holding a request queue, and a ₹10 request is noise to the
 * sellers who would actually be using this. The floor is checked server-side
 * against the balance, so it cannot be side-stepped by editing the request.
 */
export const MIN_PAYOUT_PAISE = 50000;

/* ---------------------------------- filters ------------------------------- */

/**
 * The chips across the top of the wallet.
 *
 * `all` is not a type — it is the absence of a type filter, resolved to `null`
 * below. `payouts` covers both payout directions (`PAYOUT` and
 * `PAYOUT_REVERSAL`) because a seller asking "what payouts are there" means "show
 * me money leaving my wallet", and a memo row about one is part of that story.
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

export const WALLET_FILTER_TYPES: Record<Exclude<WalletFilter, "all">, WalletTransactionType[]> = {
  sales: ["SALE"],
  rentals: ["RENTAL"],
  refunds: ["REFUND"],
  fees: ["PLATFORM_FEE"],
  payouts: ["PAYOUT", "PAYOUT_REVERSAL"],
  adjustments: ["ADJUSTMENT"],
};

export function isWalletFilter(value: unknown): value is WalletFilter {
  return typeof value === "string" && (WALLET_FILTERS as readonly string[]).includes(value);
}

/** Date windows. `today` is timezone-aware; the rest are rolling. */
export const WALLET_RANGES = ["today", "7d", "30d", "90d", "ytd", "custom"] as const;
export type WalletRange = (typeof WALLET_RANGES)[number];

export function isWalletRange(value: unknown): value is WalletRange {
  return typeof value === "string" && (WALLET_RANGES as readonly string[]).includes(value);
}

/** Two years, matching the analytics page's cap on a custom window. */
export const MAX_CUSTOM_RANGE_DAYS = 730;

/**
 * Minutes the viewer's clock is **ahead** of UTC.
 *
 * "Today" has to mean the seller's today. A seller in Kolkata asking for today's
 * earnings and getting UTC's answer is being shown a window that starts five and a
 * half hours before their day does — and at 20:00 local it shows *tomorrow's*
 * boundary as the end of today. So the browser sends its own offset and the server
 * does the day arithmetic against it, in one place, rather than each timestamp in
 * the payload being interpreted in whatever zone the reader happens to be in.
 *
 * Clamped to the real range of UTC offsets so a hand-edited query string cannot ask
 * for a window thirty years long.
 */
const MAX_TZ_OFFSET_MINUTES = 14 * 60;

export function clampTimezoneOffset(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-MAX_TZ_OFFSET_MINUTES, Math.min(MAX_TZ_OFFSET_MINUTES, Math.trunc(parsed)));
}

export const walletQuerySchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(20).default(20),
  search: z.string().trim().max(120).catch("").default(""),
  filter: z.string().trim().optional().catch(undefined),
  range: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
  /** Minutes east of UTC, from the browser. See `clampTimezoneOffset`. */
  tz: z.coerce.number().optional().catch(undefined),
});

export type ResolvedWalletRange = {
  from: Date;
  to: Date;
  bucket: "day" | "month";
};

export type ResolvedWalletFilters = {
  page: number;
  pageSize: number;
  offset: number;
  search: string;
  filter: WalletFilter;
  /** `null` means "every type" — the `all` chip. */
  types: WalletTransactionType[] | null;
  range: WalletRange;
  from: Date | null;
  to: Date | null;
  offsetMinutes: number;
};

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a `YYYY-MM-DD` as a **local** day for the given offset.
 *
 * A bare date is a calendar day in the seller's own reckoning, not a UTC instant,
 * so `2026-09-01` at `+05:30` starts at `2026-08-31T18:30:00Z`. Getting this
 * backwards is invisible in UTC and off by half a day everywhere else, which is
 * how "why is my first sale missing from this month" happens.
 */
function parseLocalBoundary(
  value: string | undefined,
  offsetMinutes: number,
  endOfDay: boolean,
): Date | null {
  if (!value) return null;
  if (!BARE_DATE.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  if (endOfDay)
    return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMinutes * 60_000);
  return new Date(Date.UTC(year, month - 1, day) - offsetMinutes * 60_000);
}

/**
 * Resolve a range chip to UTC boundaries, in the seller's timezone.
 *
 * `today` and `ytd` are calendar-relative and therefore need the offset. `7d` /
 * `30d` / `90d` are deliberately **rolling** rather than "the last N calendar
 * days": the words "last 30 days" have to keep meaning the last thirty days when a
 * bookmarked link is opened in June. A malformed custom range falls back to 30 days
 * rather than throwing — a mangled query string should show the last thirty days,
 * not an error page.
 */
export function resolveWalletRange(
  range: WalletRange,
  offsetMinutes: number,
  from?: string,
  to?: string,
  now: Date = new Date(),
): ResolvedWalletRange {
  const shift = offsetMinutes * 60_000;

  if (range === "custom") {
    const start = parseLocalBoundary(from, offsetMinutes, false);
    const end = parseLocalBoundary(to, offsetMinutes, true);
    if (start && end && end >= start) {
      const days = (end.getTime() - start.getTime()) / 86_400_000;
      if (days <= MAX_CUSTOM_RANGE_DAYS) {
        return { from: start, to: end, bucket: days > 92 ? "month" : "day" };
      }
    }
    return rollingRange(30, now);
  }

  if (range === "today") {
    const local = new Date(now.getTime() + shift);
    const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
    return {
      from: new Date(start - shift),
      to: new Date(start + 86_399_999 - shift),
      bucket: "day",
    };
  }

  if (range === "ytd") {
    const local = new Date(now.getTime() + shift);
    return {
      from: new Date(Date.UTC(local.getUTCFullYear(), 0, 1) - shift),
      to: now,
      bucket: "month",
    };
  }

  return rollingRange(Number(range.replace("d", "")), now);
}

function rollingRange(days: number, now: Date): ResolvedWalletRange {
  return { from: new Date(now.getTime() - days * 86_400_000), to: now, bucket: "day" };
}

/**
 * Turn a query string into the filters the list actually runs with.
 *
 * Every field degrades rather than throwing, because these arrive from a URL a
 * seller (or a bookmark, or an IDOR attempt) controls. An unknown chip falls back
 * to `all`, an unknown window to 30 days, and a nonsense page to page 1 — the
 * result is a usable wallet rather than an error page.
 */
export function resolveWalletFilters(raw: unknown, now: Date = new Date()): ResolvedWalletFilters {
  const parsed = walletQuerySchema.parse(raw ?? {});
  const offsetMinutes = clampTimezoneOffset(parsed.tz);
  const filter = isWalletFilter(parsed.filter) ? parsed.filter : "all";
  const range = isWalletRange(parsed.range) ? parsed.range : "30d";
  const resolved = resolveWalletRange(range, offsetMinutes, parsed.from, parsed.to, now);

  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    offset: (parsed.page - 1) * parsed.pageSize,
    search: parsed.search,
    filter,
    types: filter === "all" ? null : WALLET_FILTER_TYPES[filter],
    range,
    from: resolved.from,
    to: resolved.to,
    offsetMinutes,
  };
}

/* -------------------------------- conditions ------------------------------- */

/**
 * The filter predicates a wallet list needs — type, search and window.
 *
 * Deliberately **without** the seller predicate. Ownership is not one of the
 * optional conditions a caller could forget: every caller in this module ANDs
 * `eq(walletTransactions.sellerId, sellerId)` in ahead of these, so it is the
 * first term of the `WHERE` clause rather than a filter somebody left out. That is
 * why the seller id is not a parameter here — a function whose signature invites
 * `buildWalletConditions(filters)` is a function that can be called with the scope
 * missing.
 */
export function buildWalletConditions(
  filters: Pick<ResolvedWalletFilters, "types" | "search" | "from" | "to">,
): SQL[] {
  const conditions: SQL[] = [];

  if (filters.types && filters.types.length > 0) {
    conditions.push(inArray(walletTransactions.type, filters.types));
  }
  if (filters.search) {
    // Two columns, both written by the server: the human sentence and the public
    // reference a seller would actually type (`RV-…`, `PAY-…`). Never the
    // auto-increment id — that is a row count, and searching by it would answer
    // questions about other sellers' volume.
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        like(walletTransactions.description, pattern),
        like(walletTransactions.reference, pattern),
      )!,
    );
  }
  if (filters.from) conditions.push(gte(walletTransactions.createdAt, filters.from));
  if (filters.to) conditions.push(lte(walletTransactions.createdAt, filters.to));

  return conditions;
}

/* --------------------------------- balance --------------------------------- */

/**
 * The four numbers the wallet page leads with, each a positive magnitude.
 *
 * Everything is a single `SELECT` with `SUM(CASE …)`, so the four figures are read
 * from one consistent snapshot of the table — they cannot disagree with each other
 * because there is no window between them.
 */
export type WalletBalance = {
  /**
   * Released earnings, less anything reserved by an unresolved payout and less
   * everything already paid out. This is the number a seller may request.
   */
  availablePaise: number;
  /** Earned, not yet past the settlement delay. Not requestable. */
  pendingPaise: number;
  /** Held by `PENDING`/`PROCESSING` payouts awaiting an admin. */
  reservedPaise: number;
  /** Released credits over the seller's whole history, net of reversals. */
  lifetimeEarnedPaise: number;
  /** The platform's commission over the seller's whole history. */
  lifetimeFeesPaise: number;
  /** Given back after a cancellation or refund. */
  lifetimeRefundsPaise: number;
  /** Actually marked `COMPLETED` by an admin. */
  lifetimePaidOutPaise: number;
  currency: string;
};

/**
 * The live-money predicate, stated once so the balance and the series cannot drift.
 *
 * A row counts if it is not `REVERSED` and it is in the state its type partitions
 * it into. `PAYOUT` rows count when `COMPLETED` (the money left — permanently) or
 * when `PENDING`/`PROCESSING` (reserved — it has not left yet). `PAYOUT_REVERSAL`
 * counts for nothing: it is a memo of a payout that stopped counting, so counting
 * it too would hand the money back twice.
 */
const COUNTS = sql`${walletTransactions.status} <> 'REVERSED'`;

/** Only one statement, so the figures cannot come from different snapshots. */
export async function getWalletBalance(sellerId: number): Promise<WalletBalance> {
  const [row] = await db
    .select({
      earningsAvailable: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} IN ('SALE','RENTAL','PLATFORM_FEE','REFUND','ADJUSTMENT')
          AND ${walletTransactions.status} = 'AVAILABLE'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      earningsPending: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} IN ('SALE','RENTAL','PLATFORM_FEE','REFUND','ADJUSTMENT')
          AND ${walletTransactions.status} = 'PENDING'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      reserved: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} = 'PAYOUT'
          AND ${walletTransactions.status} IN ('PENDING','PROCESSING')
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      paidOut: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} = 'PAYOUT'
          AND ${walletTransactions.status} = 'COMPLETED'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      lifetimeEarned: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} IN ('SALE','RENTAL') AND ${COUNTS}
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      lifetimeFees: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} = 'PLATFORM_FEE' AND ${COUNTS}
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      lifetimeRefunds: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} = 'REFUND' AND ${COUNTS}
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.sellerId, sellerId));

  // Negative sums flipped to a magnitude: a reservation is how much is *held*, and a
  // fee or refund figure shown as `-₹100` would read as a bug.
  const reserved = Math.abs(Number(row?.reserved ?? 0));

  return {
    // Released earnings, less reserved and less everything already paid out. The
    // completed payouts are negative rows, so adding them subtracts them.
    availablePaise: Number(row?.earningsAvailable ?? 0) - reserved + Number(row?.paidOut ?? 0),
    pendingPaise: Number(row?.earningsPending ?? 0),
    reservedPaise: reserved,
    lifetimeEarnedPaise: Number(row?.lifetimeEarned ?? 0),
    lifetimeFeesPaise: Math.abs(Number(row?.lifetimeFees ?? 0)),
    lifetimeRefundsPaise: Math.abs(Number(row?.lifetimeRefunds ?? 0)),
    lifetimePaidOutPaise: Math.abs(Number(row?.paidOut ?? 0)),
    currency: "INR",
  };
}

/** One row per ledger type, for the wallet's own summary strip. */
export type WalletBreakdownRow = {
  type: WalletTransactionType;
  count: number;
  /** Signed sum, so a credit and a debit are not silently made comparable. */
  amountPaise: number;
};

export async function getWalletBreakdown(
  sellerId: number,
  filters: Pick<ResolvedWalletFilters, "from" | "to">,
): Promise<WalletBreakdownRow[]> {
  const rows = await db
    .select({
      type: walletTransactions.type,
      amountPaise: sql<number>`COALESCE(SUM(${walletTransactions.amount}), 0)`,
      count: count(),
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.sellerId, sellerId),
        filters.from ? gte(walletTransactions.createdAt, filters.from) : undefined,
        filters.to ? lte(walletTransactions.createdAt, filters.to) : undefined,
      ),
    )
    .groupBy(walletTransactions.type);

  return rows.map((row) => ({
    type: row.type as WalletTransactionType,
    count: Number(row.count ?? 0),
    amountPaise: Number(row.amountPaise ?? 0),
  }));
}

/* ---------------------------------- series --------------------------------- */

export type WalletSeriesPoint = {
  /** `YYYY-MM-DD` or `YYYY-MM-01`, in the seller's own timezone. */
  date: string;
  salePaise: number;
  rentalPaise: number;
  feePaise: number;
  refundPaise: number;
  payoutPaise: number;
};

/**
 * Earnings over time, grouped in SQL in the seller's timezone.
 *
 * The bucket expression shifts the stored UTC timestamp by the viewer's offset
 * **before** formatting, rather than formatting first and hoping. `DATE_ADD` with
 * a parameter is how the boundary stays correct for somebody at `+05:30`: an
 * earning recorded at 19:00 UTC belongs to *their* next day, and only this
 * ordering puts it there.
 *
 * `REVERSED` rows are excluded from every series column — a reversed earning did
 * not happen, and a chart that kept drawing it would contradict the balance card
 * directly above it.
 */
export async function getWalletSeries(
  sellerId: number,
  range: ResolvedWalletRange,
  offsetMinutes: number,
): Promise<WalletSeriesPoint[]> {
  const shifted = sql<Date>`DATE_ADD(${walletTransactions.createdAt}, INTERVAL ${offsetMinutes} MINUTE)`;
  const bucket =
    range.bucket === "month"
      ? sql<string>`DATE_FORMAT(${shifted}, '%Y-%m-01')`
      : sql<string>`DATE_FORMAT(${shifted}, '%Y-%m-%d')`;

  const rows = await db
    .select({
      date: bucket,
      sale: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} = 'SALE'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      rental: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} = 'RENTAL'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      fee: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} = 'PLATFORM_FEE'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      refund: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} = 'REFUND'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      payout: sql<number>`COALESCE(SUM(CASE WHEN ${walletTransactions.type} = 'PAYOUT'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.sellerId, sellerId),
        gte(walletTransactions.createdAt, range.from),
        lte(walletTransactions.createdAt, range.to),
        sql`${walletTransactions.status} <> 'REVERSED'`,
      ),
    )
    .groupBy(bucket)
    .orderBy(bucket);

  const byDate = new Map(
    rows.map((row) => [
      String(row.date),
      {
        date: String(row.date),
        salePaise: Number(row.sale ?? 0),
        rentalPaise: Number(row.rental ?? 0),
        feePaise: Number(row.fee ?? 0),
        refundPaise: Math.abs(Number(row.refund ?? 0)),
        payoutPaise: Math.abs(Number(row.payout ?? 0)),
      },
    ]),
  );

  return zeroFillWalletSeries(byDate, range);
}

/**
 * Fill in the days (or months) with no activity.
 *
 * Without this a chart draws a straight line from Tuesday to Thursday and the gap
 * reads as "nothing happened", when what happened is that Tuesday's bar was
 * dropped because it had no row. Bounded to the buckets the range can contain, so
 * a two-year window is 24 monthly points rather than 730 daily ones.
 */
function zeroFillWalletSeries(
  byDate: Map<string, WalletSeriesPoint>,
  range: ResolvedWalletRange,
): WalletSeriesPoint[] {
  const point = (date: string): WalletSeriesPoint =>
    byDate.get(date) ?? {
      date,
      salePaise: 0,
      rentalPaise: 0,
      feePaise: 0,
      refundPaise: 0,
      payoutPaise: 0,
    };

  const points: WalletSeriesPoint[] = [];

  if (range.bucket === "month") {
    const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1));
    const last = Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1);
    let guard = 0;
    while (cursor.getTime() <= last && guard < 240) {
      points.push(point(cursor.toISOString().slice(0, 10)));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      guard += 1;
    }
    return points;
  }

  const cursor = new Date(`${range.from.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const last = range.to.toISOString().slice(0, 10);
  let guard = 0;
  while (cursor.toISOString().slice(0, 10) <= last && guard < 800) {
    points.push(point(cursor.toISOString().slice(0, 10)));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return points;
}

/* ---------------------------------- listing -------------------------------- */

export type WalletTransactionRow = {
  id: number;
  type: WalletTransactionType;
  /** Signed paise. The sign is the point — never send an absolute value. */
  amount: number;
  status: string;
  description: string;
  reference: string | null;
  orderId: number | null;
  orderItemId: number | null;
  rentalId: number | null;
  payoutId: number | null;
  createdAt: string;
};

const LEDGER_COLUMNS = {
  id: walletTransactions.id,
  type: walletTransactions.type,
  amount: walletTransactions.amount,
  status: walletTransactions.status,
  description: walletTransactions.description,
  reference: walletTransactions.reference,
  orderId: walletTransactions.orderId,
  orderItemId: walletTransactions.orderItemId,
  rentalId: walletTransactions.rentalId,
  payoutId: walletTransactions.payoutId,
  createdAt: walletTransactions.createdAt,
};

/** One page of the ledger. Two queries — the page and the count — never N+1. */
export async function listWalletTransactions(
  sellerId: number,
  filters: ResolvedWalletFilters,
): Promise<{ rows: WalletTransactionRow[]; total: number }> {
  const where = and(eq(walletTransactions.sellerId, sellerId), ...buildWalletConditions(filters));

  const [rows, [counted]] = await Promise.all([
    db
      .select(LEDGER_COLUMNS)
      .from(walletTransactions)
      .where(where)
      // `id` breaks ties so pagination is stable when two rows share a timestamp —
      // without it, page 2 can repeat a row from page 1.
      .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id))
      .limit(filters.pageSize)
      .offset(filters.offset),
    db
      .select({ total: sql<number>`COUNT(*)` })
      .from(walletTransactions)
      .where(where),
  ]);

  return {
    total: Number(counted?.total ?? 0),
    rows: rows.map(serializeLedgerRow),
  };
}

/**
 * `type` comes back as `string` because the column is a `varchar`, so it is narrowed
 * here rather than cast at every read site. An unrecognised value degrades to
 * `ADJUSTMENT` — the one type that asserts nothing — instead of throwing, because a
 * row written by a future feature must still render rather than break a seller's
 * whole ledger with a 500.
 */
function serializeLedgerRow(row: {
  id: number;
  type: string;
  amount: number;
  status: string;
  description: string;
  reference: string | null;
  orderId: number | null;
  orderItemId: number | null;
  rentalId: number | null;
  payoutId: number | null;
  createdAt: Date;
}): WalletTransactionRow {
  return {
    ...row,
    type: isWalletTransactionType(row.type) ? row.type : "ADJUSTMENT",
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * One ledger row, as its own seller may read it.
 *
 * Ownership sits in the predicate, so another seller's row is the same 404 as a
 * row that does not exist — a 403 would confirm the id is real, which is precisely
 * what an IDOR probe is checking for.
 */
export async function getWalletTransaction(
  sellerId: number,
  id: number,
): Promise<WalletTransactionRow> {
  const [row] = await db
    .select(LEDGER_COLUMNS)
    .from(walletTransactions)
    .where(and(eq(walletTransactions.id, id), eq(walletTransactions.sellerId, sellerId)))
    .limit(1);

  if (!row) throw new HttpError(404, "NOT_FOUND", "Transaction not found.");
  return serializeLedgerRow(row);
}

/* --------------------------------- recording -------------------------------- */

/**
 * MySQL's duplicate-entry error. Caught and swallowed **only** where the insert is
 * deliberately repeatable, which is why it is a named predicate rather than a
 * `catch (e) { return; }` — a dropped recording would be an invisible hole in a
 * seller's balance and no other process would ever notice it.
 */
function isDuplicateKey(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Duplicate") || message.includes("duplicate");
}

/**
 * Money a single line or booking earned, gross of the platform fee.
 *
 * A sale's is `line_total − security_deposit`: the deposit is money the customer
 * pays and the seller does not keep, and counting it as income is the single
 * easiest way to overstate a balance. A rental's is `rental_subtotal`, which the
 * rental engine already computes without the deposit.
 */
export type EarningSource = {
  sellerId: number;
  /** Gross earning in paise, deposit already excluded. Always positive. */
  grossPaise: number;
  description: string;
  reference: string | null;
  orderId?: number | null;
  orderItemId?: number | null;
  rentalId?: number | null;
};

/**
 * Record an earning as two rows: the gross credit and the platform's debit.
 *
 * Both land in the same call so they share the idempotency key's lifetime and can
 * never end up in different buckets — a fee that stayed `PENDING` after the sale it
 * belonged to was released would make the balance wrong forever, with nothing to
 * point at the cause.
 *
 * A zero fee writes no row. `PLATFORM_FEE` with `amount = 0` is not "no fee
 * charged", it is a row that sorts and filters like a charge and contributes
 * nothing, which is worse.
 */
export async function recordEarning(
  executor: WalletExecutor,
  source: EarningSource,
  options: { type: "SALE" | "RENTAL"; key: string; feePercent: number },
): Promise<void> {
  if (!Number.isInteger(source.grossPaise) || source.grossPaise < 0) {
    throw new HttpError(500, "INVALID_EARNING", "An earning amount must be whole paise.");
  }

  const feePaise = platformFee(source.grossPaise, options.feePercent);

  // An `AVAILABLE` status would be a claim the money is withdrawable; a sale that
  // has just been delivered has not cleared the settlement delay. Asserted rather
  // than assumed so a future caller cannot get it wrong silently.
  assertWalletStatus(options.type, "PENDING");

  try {
    await executor.insert(walletTransactions).values({
      sellerId: source.sellerId,
      orderId: source.orderId ?? null,
      orderItemId: source.orderItemId ?? null,
      rentalId: source.rentalId ?? null,
      type: options.type,
      amount: source.grossPaise,
      status: "PENDING",
      description: source.description,
      reference: source.reference,
      idempotencyKey: `${options.key}`,
    });
  } catch (error) {
    // A retried lifecycle transition is a no-op, not a second credit.
    if (!isDuplicateKey(error)) throw error;
    return;
  }

  if (feePaise <= 0) return;

  try {
    await executor.insert(walletTransactions).values({
      sellerId: source.sellerId,
      orderId: source.orderId ?? null,
      orderItemId: source.orderItemId ?? null,
      rentalId: source.rentalId ?? null,
      type: "PLATFORM_FEE",
      amount: -feePaise,
      status: "PENDING",
      description: `Platform fee on ${source.reference ?? source.description}`.slice(0, 200),
      reference: source.reference,
      idempotencyKey: `fee:${options.key}`,
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
}

/**
 * Record a delivered sale as an earning, from the order line itself.
 *
 * Every figure is read from `order_items` rather than passed in. The caller is a
 * lifecycle transition that knows only that a line was marked delivered, and it is
 * exactly the kind of caller that cannot be trusted with an amount — the seller's
 * balance would then be whatever the request asked for.
 *
 * Idempotent on `sale:{orderItemId}`, so a replayed webhook or a second
 * "Mark delivered" is a constraint violation rather than a second credit.
 */
export async function recordSaleEarning(
  executor: WalletExecutor,
  orderItemId: number,
): Promise<void> {
  const [line] = await executor
    .select({
      id: orderItems.id,
      sellerId: orderItems.sellerId,
      orderId: orderItems.orderId,
      title: orderItems.titleSnapshot,
      lineTotal: orderItems.lineTotal,
      securityDeposit: orderItems.securityDeposit,
      mode: orderItems.mode,
    })
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .limit(1);

  if (!line) throw new HttpError(404, "NOT_FOUND", "Order item not found.");
  // A rental line is earned at return, not at delivery, and double-booking it here
  // would credit the seller for a booking that may still be returned.
  if (line.mode !== "BUY") return;

  await recordEarning(
    executor,
    {
      sellerId: line.sellerId,
      grossPaise: line.lineTotal - line.securityDeposit,
      description: `Sale of ${line.title}`.slice(0, 200),
      reference: null,
      orderId: line.orderId,
      orderItemId: line.id,
    },
    {
      type: "SALE",
      key: `sale:${line.id}`,
      feePercent: PLATFORM_SALE_FEE_PERCENT,
    },
  );
}

/**
 * Record a returned rental as an earning.
 *
 * Recorded only at `RETURNED`/`COMPLETED` — never at booking. A booking is a
 * promise; the item coming back is the fact, and crediting the former means a
 * seller is paid for an item that never left the shelf.
 */
export async function recordRentalEarning(
  executor: WalletExecutor,
  rentalId: number,
): Promise<void> {
  const [rental] = await executor
    .select({
      id: rentals.id,
      ownerId: rentals.ownerId,
      orderId: rentals.orderId,
      rentalSubtotal: rentals.rentalSubtotal,
    })
    .from(rentals)
    .where(eq(rentals.id, rentalId))
    .limit(1);

  if (!rental) throw new HttpError(404, "NOT_FOUND", "Rental not found.");

  const [line] = rental.orderId
    ? await executor
        .select({ title: orderItems.titleSnapshot })
        .from(orderItems)
        .where(eq(orderItems.orderId, rental.orderId))
        .limit(1)
    : [undefined];

  await recordEarning(
    executor,
    {
      sellerId: rental.ownerId,
      grossPaise: rental.rentalSubtotal,
      description: `Rental of ${line?.title ?? "an item"}`.slice(0, 200),
      reference: null,
      orderId: rental.orderId,
      rentalId: rental.id,
    },
    {
      type: "RENTAL",
      key: `rental:${rental.id}`,
      feePercent: PLATFORM_RENTAL_FEE_PERCENT,
    },
  );
}

/* ------------------------------- reversal ---------------------------------- */

/**
 * Unwind the earning behind an order line or a rental.
 *
 * Two effects, and both are needed:
 *
 *  1. the original credit and its fee are flipped to `REVERSED`, which is what
 *     actually removes them from the balance;
 *  2. a single `REFUND` row records the net, at the same state the originals held —
 *     `AVAILABLE` if the money had cleared settlement, `REVERSED` if it had not, in
 *     which case the whole episode contributes nothing to either bucket.
 *
 * Nothing is overwritten or deleted, so "this seller earned ₹2,000 and it was
 * returned" stays readable as two facts rather than one edited one.
 *
 * Idempotent: re-running finds no live rows to flip and returns.
 */
export async function recordEarningReversal(
  executor: WalletExecutor,
  target: { orderItemId?: number; rentalId?: number },
  reason: string,
): Promise<void> {
  const scope =
    target.orderItemId !== undefined
      ? eq(walletTransactions.orderItemId, target.orderItemId)
      : target.rentalId !== undefined
        ? eq(walletTransactions.rentalId, target.rentalId)
        : null;

  if (!scope) throw new HttpError(400, "BAD_REQUEST", "Nothing to refund.");

  const original = await executor
    .select({
      id: walletTransactions.id,
      sellerId: walletTransactions.sellerId,
      type: walletTransactions.type,
      amount: walletTransactions.amount,
      status: walletTransactions.status,
      orderId: walletTransactions.orderId,
      orderItemId: walletTransactions.orderItemId,
      rentalId: walletTransactions.rentalId,
      reference: walletTransactions.reference,
      description: walletTransactions.description,
    })
    .from(walletTransactions)
    .where(and(scope, inArray(walletTransactions.type, ["SALE", "RENTAL", "PLATFORM_FEE"])));

  const live = original.filter((row) => row.status !== "REVERSED");
  if (live.length === 0) return;

  const earnings = live.filter((row) => row.type !== "PLATFORM_FEE");
  const fee = live.find((row) => row.type === "PLATFORM_FEE");
  const lead = earnings[0] ?? live[0];

  const net = earnings.reduce((sum, row) => sum + row.amount, 0) + (fee?.amount ?? 0);
  // The credit and its fee settled together, so they share one state.
  const settled = earnings.every((row) => row.status === "AVAILABLE");

  for (const row of live) {
    await executor
      .update(walletTransactions)
      .set({ status: "REVERSED", updatedAt: new Date() })
      .where(eq(walletTransactions.id, row.id));
  }

  await executor.insert(walletTransactions).values({
    sellerId: lead.sellerId,
    orderId: lead.orderId,
    orderItemId: target.orderItemId ?? lead.orderItemId,
    rentalId: target.rentalId ?? lead.rentalId,
    type: "REFUND",
    amount: -net,
    status: settled ? "AVAILABLE" : "REVERSED",
    description: `Refund · ${reason}`.slice(0, 200),
    reference: lead.reference,
    idempotencyKey: `refund:${
      earnings
        .map((row) => row.id)
        .sort((a, b) => a - b)
        .join(",") || lead.id
    }`,
  });
}

/* ------------------------------- settlement -------------------------------- */

/**
 * Release earnings that have cleared the settlement delay.
 *
 * A single `UPDATE` over the rows whose recording is old enough, so a seller with
 * 4,000 rows pays one statement rather than 4,000 comparisons in JS. Scoped by
 * seller when a seller is given, and unbounded otherwise — which is the shape an
 * admin call or a nightly job wants.
 *
 * Called opportunistically from the wallet read and from the completion paths. That
 * is deliberate: a background job that has not run must not make money permanently
 * unavailable, and a read is the moment a seller is demonstrably asking.
 *
 * ## `PLATFORM_FEE` has to be in this list, and the reason is not cosmetic
 *
 * `recordEarning` writes the gross credit and its fee **both** as `PENDING`, on the
 * same `created_at`, precisely so they settle together. Releasing only `SALE` and
 * `RENTAL` would leave every fee stuck in `PENDING` forever: the credit would become
 * withdrawable while its fee sat in the "settling" bucket, so `pendingPaise` would
 * grow a −₹120 line per sale that never cleared, and the lifetime fee total would be
 * reported from a bucket that no longer describes anything. Nothing would ever look
 * obviously broken and the balance would be quietly wrong in one direction.
 *
 * `REFUND` and `ADJUSTMENT` are deliberately excluded: a refund is written at the
 * state its originals held, so it is already in the right bucket, and an adjustment
 * is whatever support decided it is.
 */
export async function releaseDueEarnings(
  executor: WalletExecutor,
  options: { sellerId?: number; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - SETTLEMENT_DELAY_DAYS * 86_400_000);

  // One statement for all three types: `and()` has no grouping, so two
  // `eq(type, …)` predicates would be mutually unsatisfiable — the test has to be
  // an `IN`.
  const result = await executor
    .update(walletTransactions)
    .set({ status: "AVAILABLE", updatedAt: now })
    .where(
      and(
        inArray(walletTransactions.type, ["SALE", "RENTAL", "PLATFORM_FEE"]),
        eq(walletTransactions.status, "PENDING"),
        lte(walletTransactions.createdAt, cutoff),
        options.sellerId !== undefined
          ? eq(walletTransactions.sellerId, options.sellerId)
          : undefined,
      ),
    );

  const affected =
    result instanceof Array
      ? result.length
      : Number((result as { affectedRows?: number }).affectedRows ?? 0);
  return affected;
}

/* --------------------------------- payouts --------------------------------- */

export type PayoutRow = {
  id: number;
  payoutNumber: string;
  /** Always positive. The sign lives on the ledger row. */
  amount: number;
  currency: string;
  status: PayoutStatus;
  methodId: number | null;
  methodLabel: string;
  note: string | null;
  failureReason: string | null;
  requestedAt: string;
  processingAt: string | null;
  completedAt: string | null;
};

const PAYOUT_COLUMNS = {
  id: payouts.id,
  payoutNumber: payouts.payoutNumber,
  amount: payouts.amount,
  currency: payouts.currency,
  status: payouts.status,
  methodId: payouts.methodId,
  methodLabel: payouts.methodLabel,
  note: payouts.note,
  failureReason: payouts.failureReason,
  requestedAt: payouts.requestedAt,
  processingAt: payouts.processingAt,
  completedAt: payouts.completedAt,
};

/** A `payouts` row as it comes back from the driver, before serialisation. */
type PayoutSelectRow = {
  id: number;
  payoutNumber: string;
  amount: number;
  currency: string;
  status: string;
  methodId: number | null;
  methodLabel: string;
  note: string | null;
  failureReason: string | null;
  requestedAt: Date;
  processingAt: Date | null;
  completedAt: Date | null;
};

/**
 * Public payout reference, `PAY-<year>-XXXXXX`.
 *
 * Same reasoning and the same 32-symbol alphabet as the `RV-…` order numbers: a
 * sequential id would tell a seller how many payouts every other seller in the
 * marketplace has taken, which is not their business. Six characters is 30 bits, so
 * the unique index on the column is still the real arbiter and the request path
 * retries rather than assuming a collision cannot happen.
 */
export const PAYOUT_NUMBER_PREFIX = "PAY";

export function createPayoutNumber(year = new Date().getFullYear()): string {
  return `${PAYOUT_NUMBER_PREFIX}-${year}-${orderNumberSuffix()}`;
}

function serializePayout(row: PayoutSelectRow): PayoutRow {
  return {
    id: row.id,
    payoutNumber: row.payoutNumber,
    amount: row.amount,
    currency: row.currency,
    status: row.status as PayoutStatus,
    methodId: row.methodId,
    methodLabel: row.methodLabel,
    note: row.note,
    failureReason: row.failureReason,
    requestedAt: row.requestedAt.toISOString(),
    processingAt: row.processingAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** `PAY-2026-XXXXXX` or a legacy numeric id, each matched by its own predicate. */
function payoutReferenceCondition(reference: string | number): SQL {
  const numeric = Number(reference);
  if (Number.isInteger(numeric) && numeric > 0) return eq(payouts.id, numeric);
  return eq(payouts.payoutNumber, String(reference).toUpperCase());
}

export async function listPayouts(
  sellerId: number,
  filters: { status: PayoutStatus | null; from: Date | null; to: Date | null },
): Promise<PayoutRow[]> {
  const rows = await db
    .select(PAYOUT_COLUMNS)
    .from(payouts)
    .where(
      and(
        eq(payouts.sellerId, sellerId),
        filters.status ? eq(payouts.status, filters.status) : undefined,
        filters.from ? gte(payouts.requestedAt, filters.from) : undefined,
        filters.to ? lte(payouts.requestedAt, filters.to) : undefined,
      ),
    )
    .orderBy(desc(payouts.requestedAt), desc(payouts.id))
    .limit(100);

  return rows.map(serializePayout);
}

/**
 * One payout, as its own seller may read it.
 *
 * Ownership in the predicate: another seller's payout is the same 404 as one that
 * does not exist, so a reference cannot be used to confirm an id is real.
 */
export async function getPayout(sellerId: number, reference: string | number): Promise<PayoutRow> {
  const [row] = await db
    .select(PAYOUT_COLUMNS)
    .from(payouts)
    .where(and(eq(payouts.sellerId, sellerId), payoutReferenceCondition(reference)))
    .limit(1);

  if (!row) throw new HttpError(404, "NOT_FOUND", "Payout not found.");
  return serializePayout(row);
}

export type RequestPayoutResult = {
  payout: PayoutRow;
  /** False when the idempotency key had already been used. */
  created: boolean;
  balance: WalletBalance;
};

/**
 * Request a payout.
 *
 * ## The order of the steps is the design
 *
 *  1. **Lock the seller's `users` row `FOR UPDATE`.** Not the payout table, not the
 *     ledger — the seller row, because it is the one row every concurrent request
 *     from this seller must queue behind. Two requests arriving together then run
 *     one after the other, and the second sees the first's reservation. Without the
 *     lock both read the same available balance and both succeed, which is a
 *     double-payout no later check can undo.
 *  2. **Return the existing payout when the key has been seen.** A double-clicked
 *     button or a client retry resolves to the payout that already exists, with
 *     `created: false`, rather than reserving the money twice.
 *  3. **Re-read the balance *inside* the transaction** and check the amount against
 *     it here. The figure the client displayed a moment ago is a screenshot of a
 *     past state, not a fact about now.
 *  4. **Write the payout and its ledger row together**, so a crash between them
 *     cannot leave money reserved with no request behind it.
 */
export async function requestPayout(input: {
  sellerId: number;
  amountPaise: number;
  methodId: number;
  note?: string | null;
  /** Server-issued when the client did not supply one. */
  idempotencyKey?: string | null;
}): Promise<RequestPayoutResult> {
  if (!Number.isInteger(input.amountPaise)) {
    throw new HttpError(400, "BAD_REQUEST", "Enter the amount in whole paise.");
  }
  if (input.amountPaise < MIN_PAYOUT_PAISE) {
    throw new HttpError(
      400,
      "PAYOUT_TOO_SMALL",
      `The smallest payout is ₹${MIN_PAYOUT_PAISE / 100}.`,
    );
  }

  const key = input.idempotencyKey?.trim() || `payout:${randomUUID()}`;

  return db.transaction(async (tx) => {
    const [seller] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.sellerId))
      .limit(1)
      .for("update");

    if (!seller) throw new HttpError(404, "NOT_FOUND", "Seller not found.");

    const [existing] = await tx
      .select(PAYOUT_COLUMNS)
      .from(payouts)
      .where(eq(payouts.idempotencyKey, key))
      .limit(1);

    if (existing) {
      return {
        payout: serializePayout(existing),
        created: false,
        balance: await sumBalance(tx, input.sellerId),
      };
    }

    // Read inside the transaction and scoped to the seller, so a request naming
    // another seller's method id is a 404 rather than a payout sent to somebody
    // else's account.
    const [method] = await tx
      .select({
        id: sellerPayoutMethods.id,
        maskedLabel: sellerPayoutMethods.maskedLabel,
      })
      .from(sellerPayoutMethods)
      .where(
        and(
          eq(sellerPayoutMethods.id, input.methodId),
          eq(sellerPayoutMethods.sellerId, input.sellerId),
        ),
      )
      .limit(1);

    if (!method) throw new HttpError(404, "NOT_FOUND", "Payout method not found.");

    const balance = await sumBalance(tx, input.sellerId);

    if (input.amountPaise > balance.availablePaise) {
      throw new HttpError(
        409,
        "INSUFFICIENT_BALANCE",
        balance.availablePaise <= 0
          ? "There is no available balance to pay out yet."
          : "That is more than your available balance.",
      );
    }

    const now = new Date();

    let payoutNumber = createPayoutNumber(now.getFullYear());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const [clash] = await tx
        .select({ id: payouts.id })
        .from(payouts)
        .where(eq(payouts.payoutNumber, payoutNumber))
        .limit(1);
      if (!clash) break;
      payoutNumber = createPayoutNumber(now.getFullYear());
    }

    const [created] = await tx
      .insert(payouts)
      .values({
        sellerId: input.sellerId,
        payoutNumber,
        amount: input.amountPaise,
        status: "PENDING",
        methodId: method.id,
        // Snapshotted, so deleting the method later cannot rewrite what a past
        // payout says it was sent to.
        methodLabel: method.maskedLabel,
        note: input.note ?? null,
        idempotencyKey: key,
        requestedAt: now,
      })
      .$returningId();

    const payoutId = Number(created.id);

    // The ledger row is what makes the reservation visible in the same `SUM` the
    // balance comes from. Negative, because the money is leaving.
    await tx.insert(walletTransactions).values({
      sellerId: input.sellerId,
      payoutId,
      type: "PAYOUT",
      amount: -input.amountPaise,
      status: "PENDING",
      description: `Payout ${payoutNumber} requested`.slice(0, 200),
      reference: payoutNumber,
      idempotencyKey: `payout-ledger:${payoutId}`,
    });

    const [row] = await tx
      .select(PAYOUT_COLUMNS)
      .from(payouts)
      .where(eq(payouts.id, payoutId))
      .limit(1);

    return {
      payout: serializePayout(row!),
      created: true,
      balance: await sumBalance(tx, input.sellerId),
    };
  });
}

/**
 * The live balance, computed on a caller's connection.
 *
 * Separate from `getWalletBalance` because that one uses the module-level `db`,
 * which is a **different connection** — and a figure read outside the transaction
 * would be exactly the pre-reservation number the row lock exists to stop anyone
 * trusting.
 *
 * The lifetime columns are zero here rather than recomputed: this function answers
 * "what may I request right now", and the four lifetime totals are the overview's
 * job. The one that matters, `lifetimePaidOutPaise`, is carried through because it
 * is read from the same row as the balance and is what a seller sees move.
 */
async function sumBalance(executor: WalletExecutor, sellerId: number): Promise<WalletBalance> {
  const [row] = await executor
    .select({
      earningsAvailable: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} IN ('SALE','RENTAL','PLATFORM_FEE','REFUND','ADJUSTMENT')
          AND ${walletTransactions.status} = 'AVAILABLE'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      earningsPending: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} IN ('SALE','RENTAL','PLATFORM_FEE','REFUND','ADJUSTMENT')
          AND ${walletTransactions.status} = 'PENDING'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      reserved: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} = 'PAYOUT'
          AND ${walletTransactions.status} IN ('PENDING','PROCESSING')
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
      paidOut: sql<number>`COALESCE(SUM(CASE
        WHEN ${walletTransactions.type} = 'PAYOUT'
          AND ${walletTransactions.status} = 'COMPLETED'
        THEN ${walletTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(walletTransactions)
    .where(eq(walletTransactions.sellerId, sellerId));

  const reserved = Math.abs(Number(row?.reserved ?? 0));
  const paidOut = Number(row?.paidOut ?? 0);

  return {
    availablePaise: Number(row?.earningsAvailable ?? 0) - reserved + paidOut,
    pendingPaise: Number(row?.earningsPending ?? 0),
    reservedPaise: reserved,
    lifetimeEarnedPaise: 0,
    lifetimeFeesPaise: 0,
    lifetimeRefundsPaise: 0,
    lifetimePaidOutPaise: Math.abs(paidOut),
    currency: "INR",
  };
}

/**
 * Advance a payout and mirror it into the ledger.
 *
 * Admin-only by construction: the caller has already been through `requireAdmin`,
 * and there is deliberately no seller-facing path into this function at all — a
 * seller must never be able to answer their own request, and in a marketplace the
 * seller is precisely who an attacker would be.
 *
 * The ledger row follows the payout's status verbatim rather than being translated
 * into the earning vocabulary, because an audit trail is more useful when it shows
 * the states an admin actually set than a lossy paraphrase of them.
 */
export async function setPayoutStatus(
  payoutId: number,
  target: PayoutStatus,
  admin: { id: number; reason?: string | null },
): Promise<PayoutRow> {
  return db.transaction(async (tx) => {
    // The payout row itself is the lock, so two admins acting at once serialise
    // instead of both writing a state derived from the same stale read.
    // `sellerId` is read alongside because the reversal memo is written for that
    // seller, and re-reading it later would be a second trip for a value the locked
    // row already holds.
    const [current] = await tx
      .select({ ...PAYOUT_COLUMNS, sellerId: payouts.sellerId })
      .from(payouts)
      .where(eq(payouts.id, payoutId))
      .limit(1)
      .for("update");

    if (!current) throw new HttpError(404, "NOT_FOUND", "Payout not found.");

    assertPayoutTransition(current.status as PayoutStatus, target);

    const now = new Date();

    await tx
      .update(payouts)
      .set({
        status: target,
        reviewedBy: admin.id,
        reviewedAt: now,
        processingAt: target === "PROCESSING" ? now : current.processingAt,
        completedAt: target === "COMPLETED" ? now : current.completedAt,
        // Stored for a refusal and cleared for a success, so a payout cannot end up
        // displaying a stale "account closed" underneath the word "Paid".
        failureReason:
          target === "FAILED" ? admin.reason?.trim() || "The payout could not be completed." : null,
        updatedAt: now,
      })
      .where(eq(payouts.id, payoutId));

    await tx
      .update(walletTransactions)
      .set({ status: target, updatedAt: now })
      .where(and(eq(walletTransactions.payoutId, payoutId), eq(walletTransactions.type, "PAYOUT")));

    if (target === "FAILED" || target === "CANCELLED") {
      // The `PAYOUT` row has left the pending bucket, so the balance query has
      // already released the reservation. This row is the memo saying why — and it
      // is counted for nothing itself, or the money would come back twice.
      await tx.insert(walletTransactions).values({
        sellerId: current.sellerId,
        payoutId,
        type: "PAYOUT_REVERSAL",
        amount: current.amount,
        status: "COMPLETED",
        description:
          target === "FAILED"
            ? `Payout ${current.payoutNumber} was not completed`.slice(0, 200)
            : `Payout ${current.payoutNumber} was cancelled`.slice(0, 200),
        reference: current.payoutNumber,
        idempotencyKey: `payout-reversal:${payoutId}:${target}`,
      });
    }

    const [row] = await tx
      .select(PAYOUT_COLUMNS)
      .from(payouts)
      .where(eq(payouts.id, payoutId))
      .limit(1);

    return serializePayout(row!);
  });
}

/** Every seller. Admin-only; see `setPayoutStatus` for why that matters. */
export async function listAllPayouts(filters: {
  status: PayoutStatus | null;
  limit: number;
}): Promise<(PayoutRow & { sellerId: number; sellerName: string | null })[]> {
  const rows = await db
    .select({ ...PAYOUT_COLUMNS, sellerId: payouts.sellerId, sellerName: users.name })
    .from(payouts)
    .leftJoin(users, eq(users.id, payouts.sellerId))
    .where(filters.status ? eq(payouts.status, filters.status) : undefined)
    .orderBy(desc(payouts.requestedAt), desc(payouts.id))
    .limit(filters.limit);

  // The seller columns are selected alongside the payout ones, so the shared
  // serialiser is handed the payout fields alone rather than a shape that claims
  // `sellerName` is part of `PayoutRow`.
  return rows.map(({ sellerId, sellerName, ...payout }) => ({
    ...serializePayout(payout),
    sellerId,
    sellerName: sellerName ?? null,
  }));
}

/* ---------------------------- payout methods ------------------------------ */

export type PayoutMethod = {
  id: number;
  type: string;
  accountHolder: string;
  /** Seller-supplied and already masked, e.g. `HDFC Bank •••• 4321`. */
  maskedLabel: string;
  isDefault: boolean;
  createdAt: string;
};

/**
 * A seller's saved destinations.
 *
 * Returns only the masked label and the holder name, because that is all this
 * table holds — no account number, no IFSC, no UPI VPA. There is no provider here
 * to tokenise a real one, and a table that quietly accumulated full bank details
 * "until we add a provider" is the worst possible place to start.
 */
export async function listPayoutMethods(sellerId: number): Promise<PayoutMethod[]> {
  const rows = await db
    .select({
      id: sellerPayoutMethods.id,
      type: sellerPayoutMethods.type,
      accountHolder: sellerPayoutMethods.accountHolder,
      maskedLabel: sellerPayoutMethods.maskedLabel,
      isDefault: sellerPayoutMethods.isDefault,
      createdAt: sellerPayoutMethods.createdAt,
    })
    .from(sellerPayoutMethods)
    .where(eq(sellerPayoutMethods.sellerId, sellerId))
    // Default first, then insertion order — so the form's pre-selection is the
    // seller's own choice rather than whichever row was written last.
    .orderBy(desc(sellerPayoutMethods.isDefault), asc(sellerPayoutMethods.id));

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/**
 * Save a destination, optionally as the default.
 *
 * Setting a default clears the previous one inside the same transaction, so there
 * is never a moment with two defaults or with none — which would leave the payout
 * form with nothing to pre-select and the seller guessing which one is theirs.
 */
export async function savePayoutMethod(
  sellerId: number,
  input: { type: string; accountHolder: string; maskedLabel: string; isDefault: boolean },
): Promise<{ id: number }> {
  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(sellerPayoutMethods)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(sellerPayoutMethods.sellerId, sellerId));
    }

    const [created] = await tx
      .insert(sellerPayoutMethods)
      .values({
        sellerId,
        type: input.type,
        accountHolder: input.accountHolder,
        maskedLabel: input.maskedLabel,
        isDefault: input.isDefault,
      })
      .$returningId();

    return { id: Number(created.id) };
  });
}

/** Remove a destination. Past payouts keep their own snapshot of the label. */
export async function deletePayoutMethod(sellerId: number, methodId: number): Promise<void> {
  await db
    .delete(sellerPayoutMethods)
    .where(and(eq(sellerPayoutMethods.id, methodId), eq(sellerPayoutMethods.sellerId, sellerId)));
}
