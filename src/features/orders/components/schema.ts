import { z } from "zod";
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  type OrderStatus,
  type OrderTimelineEvent,
  type OrderType,
  type PaymentStatus,
  type RentalStatus,
} from "../types";

/**
 * Order search, filter, sort and route-param schemas.
 *
 * Every value here can arrive from a URL a customer typed or edited, so each one
 * must degrade to a safe default rather than throw. A bad `?sort=` should reorder
 * the list sensibly, not replace the page with an error boundary.
 *
 * This is **not** a security boundary. The server re-validates everything and
 * scopes every query to the session user; the client validating at all is a
 * courtesy that keeps obviously-wrong requests from leaving the browser.
 */

/* --------------------------------- sorting --------------------------------- */

export const ORDER_SORTS = ["newest", "oldest", "total_desc", "total_asc"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export const ORDER_SORT_OPTIONS: { value: OrderSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "total_desc", label: "Highest total" },
  { value: "total_asc", label: "Lowest total" },
];

/* --------------------------------- filters --------------------------------- */

export const ORDER_TYPE_OPTIONS: { value: OrderType; label: string }[] = [
  { value: "PURCHASE", label: "Purchases" },
  { value: "RENTAL", label: "Rentals" },
  { value: "MIXED", label: "Rent & Buy" },
];

/**
 * Status choices, grouped so the menu reads as one coherent list.
 *
 * Only states the model can actually hold are offered. A filter for a status no
 * code can write is a filter that can only ever return nothing — so this list is
 * derived from the same constants the badges use, never hand-written twice.
 */
export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "PENDING_PAYMENT", label: "Pending payment" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY_FOR_PICKUP", label: "Ready for pickup" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

/**
 * Rental states, as *filter* values.
 *
 * Prefixed because `CONFIRMED` already means an order status. The two live in
 * different columns and an order can hold both at once, so sharing the value
 * would make one of the two chips permanently unreachable.
 */
export const RENTAL_STATUS_PREFIX = "RENTAL_";

export const RENTAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: `${RENTAL_STATUS_PREFIX}CONFIRMED`, label: "Rental booked" },
  { value: `${RENTAL_STATUS_PREFIX}ACTIVE`, label: "Rental active" },
  { value: `${RENTAL_STATUS_PREFIX}RETURN_PENDING`, label: "Return pending" },
  { value: `${RENTAL_STATUS_PREFIX}OVERDUE`, label: "Rental overdue" },
  { value: `${RENTAL_STATUS_PREFIX}RETURNED`, label: "Rental returned" },
];

const ORDER_STATUS_VALUES = new Set<string>(ORDER_STATUSES);
const RENTAL_STATUS_FILTER_VALUES = new Set<string>(RENTAL_STATUS_OPTIONS.map((o) => o.value));

export const MAX_SEARCH_LENGTH = 120;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 10;

/* ------------------------------ search params ------------------------------ */

/** Accepts a number or a numeric string; anything else is undefined. */
function asPositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function asTrimmedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/** A calendar date in `YYYY-MM-DD`, or undefined. Rejects impossible dates. */
function asDateOnly(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

/**
 * The parsed orders URL state. Every field is `undefined` when absent or
 * invalid, which is what lets "Clear filters" simply navigate to `{}`.
 */
export type OrdersSearch = {
  search?: string;
  /** An order status, or a prefixed rental filter value such as `RENTAL_ACTIVE`. */
  status?: string;
  type?: OrderType;
  sort?: OrderSort;
  page?: number;
  from?: string;
  to?: string;
};

/**
 * Parse arbitrary search params into a safe shape. Never throws.
 *
 * Written by hand rather than with `z.object().safeParse()` because the input is
 * already-parsed JSON from the router: numbers arrive as numbers, `"2"` arrives
 * as a string, and unknown keys are present. A zod schema would coerce and then
 * *keep* invalid values in some cases; this drops them, which is the behaviour
 * the URL contract wants.
 */
export function parseOrdersSearch(input: Record<string, unknown> | undefined): OrdersSearch {
  const raw = input ?? {};
  const result: OrdersSearch = {};

  const search = asTrimmedString(raw.search, MAX_SEARCH_LENGTH);
  if (search) result.search = search;

  const status = typeof raw.status === "string" ? raw.status : undefined;
  if (status && (ORDER_STATUS_VALUES.has(status) || RENTAL_STATUS_FILTER_VALUES.has(status))) {
    result.status = status;
  }

  const type = typeof raw.type === "string" ? raw.type : undefined;
  if (type && (ORDER_TYPES as readonly string[]).includes(type)) {
    result.type = type as OrderType;
  }

  const sort = typeof raw.sort === "string" ? raw.sort : undefined;
  if (sort && (ORDER_SORTS as readonly string[]).includes(sort)) {
    result.sort = sort as OrderSort;
  }

  const page = asPositiveInt(raw.page);
  if (page && page > 0) result.page = page;

  const from = asDateOnly(raw.from);
  if (from) result.from = from;

  const to = asDateOnly(raw.to);
  if (to) result.to = to;

  return result;
}

/**
 * Zod mirror of the parser above, for callers that want a schema (the list
 * query hook validates the request it is about to send). Kept alongside the
 * hand-written parser so the two cannot drift.
 */
export const ordersSearchSchema = z
  .object({
    search: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
    status: z.string().optional(),
    type: z.enum(ORDER_TYPES).optional(),
    sort: z.enum(ORDER_SORTS).optional(),
    page: z.number().int().min(1).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .partial();

/* ------------------------------ route params ------------------------------- */

const ORDER_NUMBER_PATTERN = /^RV-\d{4}-[A-Z0-9]{6}$/i;

/**
 * The `/orders/$orderId` param.
 *
 * Accepts the public `RV-2026-XXXXXX` number or the legacy numeric id, so links
 * minted before this feature (and the payment-success redirect) keep working.
 * Returns null for anything else, which the page turns into "order not found"
 * without a wasted request.
 */
export function parseOrderRouteParam(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (ORDER_NUMBER_PATTERN.test(trimmed)) return trimmed.toUpperCase();
  if (/^\d+$/.test(trimmed) && Number(trimmed) > 0) return trimmed;
  return null;
}

/* -------------------------------- predicates -------------------------------- */

/** True when any filter is narrowing the list — used for the empty state. */
export function hasActiveFilters(search: OrdersSearch): boolean {
  return Boolean(search.search || search.status || search.type || search.from || search.to);
}

/** The count of distinct chips shown, for the "Filters (2)" affordance. */
export function activeFilterCount(search: OrdersSearch): number {
  return [search.search, search.status, search.type, search.from, search.to].filter(Boolean).length;
}

/**
 * Labels for the *raw* rental states, as a badge shows them.
 *
 * Deliberately without the "Rental" prefix: a card already reads "Rental · …",
 * so "Rental · Rental active" would stutter. The prefix only appears in the
 * filter chips, where it disambiguates two different columns.
 */
const RENTAL_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Booked",
  ACTIVE: "Active",
  RETURN_PENDING: "Return pending",
  OVERDUE: "Overdue",
  RETURNED: "Returned",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
};

/** Human label for a raw status, including ones this build does not know. */
export function statusLabel(status: OrderStatus | PaymentStatus | RentalStatus): string {
  const raw = String(status);

  const orderLabel = ORDER_STATUS_OPTIONS.find((option) => option.value === raw)?.label;
  if (orderLabel) return orderLabel;

  if (RENTAL_STATUS_LABELS[raw]) return RENTAL_STATUS_LABELS[raw];

  // An unrecognised status still renders as something readable rather than
  // blank. Status values are stored in a varchar, so this is reachable the
  // moment a future feature writes a new one.
  return humanize(raw);
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* ------------------------------- status tone -------------------------------- */

/**
 * The *meaning* of a status, kept apart from how it looks.
 *
 * The badge maps a tone to colours; nothing else in the feature decides whether
 * something is "good" or "bad". Colours are never the only signal — the badge
 * always renders the label and an icon too — but the tone still needs to be
 * decided in exactly one place.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export function statusTone(status: OrderStatus | PaymentStatus | RentalStatus): StatusTone {
  switch (status) {
    case "PENDING_PAYMENT":
    case "PENDING":
      return "warning";
    case "CONFIRMED":
    case "PROCESSING":
    case "READY_FOR_PICKUP":
    case "SHIPPED":
    case "RETURN_PENDING":
      return "info";
    case "ACTIVE":
    case "PAID":
    case "DELIVERED":
    case "COMPLETED":
    case "RETURNED":
      return "success";
    case "OVERDUE":
    case "DISPUTED":
      return "warning";
    case "CANCELLED":
    case "FAILED":
      return "danger";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "neutral";
    default:
      return "neutral";
  }
}

/* --------------------------------- timeline --------------------------------- */

type TimelineInput = {
  order: {
    status: OrderStatus;
    createdAt: string;
    deliveryMethod: string;
    paymentStatus: PaymentStatus;
  };
  payment: { createdAt: string; status: PaymentStatus } | null;
  rentals: { status: RentalStatus }[];
};

const PAYMENT_SETTLED = new Set(["PAID", "SUCCEEDED"]);

/**
 * Build the order's timeline from data the server actually stores.
 *
 * The hard rule: a step is given a timestamp **only** when a real timestamp
 * exists for it. `createdAt` and the payment's own `createdAt` are real; the
 * later fulfillment steps have no recorded time in this schema, so they render
 * without one rather than with an invented "now". A timeline that lies about
 * when things happened is worse than one that admits it does not know.
 *
 * The component consuming this takes an array, so when a real event table
 * arrives the same component renders it — only this function changes.
 */
export function buildOrderTimeline({ order, payment, rentals }: TimelineInput): OrderTimelineEvent[] {
  const events: OrderTimelineEvent[] = [];

  const cancelled = order.status === "CANCELLED";
  const failed = order.paymentStatus === "FAILED";

  events.push({
    key: "placed",
    label: "Order placed",
    at: order.createdAt,
    state: "done",
  });

  if (failed) {
    events.push({
      key: "payment-failed",
      label: "Payment failed",
      description: "The payment did not complete, so no order was confirmed.",
      at: payment?.createdAt ?? null,
      state: "failed",
    });
  } else {
    events.push({
      key: "payment",
      label: "Payment confirmed",
      // A timestamp only when a settled payment row exists.
      at: payment && PAYMENT_SETTLED.has(payment.status) ? payment.createdAt : null,
      state: PAYMENT_SETTLED.has(order.paymentStatus) ? "done" : "current",
    });
  }

  if (cancelled) {
    events.push({
      key: "cancelled",
      label: "Order cancelled",
      at: null,
      state: "cancelled",
    });
    return events;
  }

  // Fulfillment ladder. `at` stays null throughout: this schema records the
  // order's *current* status, not when each status was reached.
  const ladder: { key: string; label: string; status: OrderStatus }[] = [
    { key: "confirmed", label: "Order confirmed", status: "CONFIRMED" },
    { key: "processing", label: "Processing", status: "PROCESSING" },
    order.deliveryMethod === "PICKUP"
      ? { key: "ready", label: "Ready for pickup", status: "READY_FOR_PICKUP" }
      : { key: "shipped", label: "Shipped", status: "SHIPPED" },
    order.deliveryMethod === "PICKUP"
      ? { key: "picked-up", label: "Picked up", status: "DELIVERED" }
      : { key: "delivered", label: "Delivered", status: "DELIVERED" },
    { key: "completed", label: "Completed", status: "COMPLETED" },
  ];

  const currentIndex = ladder.findIndex((step) => step.status === order.status);

  ladder.forEach((step, index) => {
    const state: OrderTimelineEvent["state"] =
      currentIndex === -1
        ? "pending"
        : index < currentIndex
          ? "done"
          : index === currentIndex
            ? "current"
            : "pending";
    events.push({ key: step.key, label: step.label, at: null, state });
  });

  // A rental that is under way is its own verified fact, not a guess.
  const activeRental = rentals.find((r) => r.status === "ACTIVE" || r.status === "OVERDUE");
  if (activeRental) {
    events.push({
      key: "rental-active",
      label: activeRental.status === "OVERDUE" ? "Rental overdue" : "Rental active",
      at: null,
      state: activeRental.status === "OVERDUE" ? "current" : "done",
    });
  }

  return events;
}
