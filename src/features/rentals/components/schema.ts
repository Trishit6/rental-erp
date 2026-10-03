import { z } from "zod";
import { RENTAL_BUCKETS, RENTAL_SORTS, RENTAL_STATUSES, type RentalSort } from "../types";

/**
 * Rental search, filter, sort and route-param schemas.
 *
 * Every value can arrive from a URL a customer edited, so each one degrades to
 * a safe default rather than throwing — a mistyped `?sort=` should reorder the
 * list sensibly, not replace the page with an error.
 *
 * This is a courtesy, not a security boundary. The server re-validates and
 * scopes every query to the session user.
 */

export { RENTAL_BUCKETS, RENTAL_SORTS };
export type { RentalSort };

export const RENTAL_SORT_OPTIONS: { value: RentalSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "ending_soon", label: "Ending soon" },
  { value: "starting_soon", label: "Starting soon" },
];

export const RENTAL_BUCKET_OPTIONS: { value: string; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

/** Statuses the filter offers. Mirrors the lifecycle constants, never hand-listed twice. */
export const RENTAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "ACTIVE", label: "Active" },
  { value: "RETURN_PENDING", label: "Return requested" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "RETURNED", label: "Returned" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const MAX_SEARCH_LENGTH = 120;
export const DEFAULT_PAGE_SIZE = 10;

/** Extension options in days. The server re-validates and may still refuse. */
export const EXTENSION_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;
export const MAX_EXTENSION_DAYS = 180;

/* ------------------------------ search params ------------------------------ */

export type RentalsSearch = {
  search?: string;
  /** A tab: upcoming | active | completed. */
  bucket?: string;
  status?: string;
  sort?: RentalSort;
  page?: number;
  from?: string;
  to?: string;
};

const STATUS_SET = new Set<string>(RENTAL_STATUSES);
const BUCKET_SET = new Set<string>(RENTAL_BUCKETS);
const SORT_SET = new Set<string>(RENTAL_SORTS);

function asPositiveInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function asTrimmed(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function asDateOnly(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) ? undefined : value;
}

/**
 * Parse arbitrary search params into a safe shape. Never throws.
 *
 * Written by hand rather than with zod because the router hands us
 * already-parsed JSON: numbers arrive as numbers, `"2"` as a string, and
 * unknown keys are present. Invalid values are *dropped*, which is what "Clear
 * filters" then relies on when it navigates to `{}`.
 */
export function parseRentalsSearch(input: Record<string, unknown> | undefined): RentalsSearch {
  const raw = input ?? {};
  const result: RentalsSearch = {};

  const search = asTrimmed(raw.search, MAX_SEARCH_LENGTH);
  if (search) result.search = search;

  if (typeof raw.bucket === "string" && BUCKET_SET.has(raw.bucket)) result.bucket = raw.bucket;
  if (typeof raw.status === "string" && STATUS_SET.has(raw.status)) result.status = raw.status;
  if (typeof raw.sort === "string" && SORT_SET.has(raw.sort)) result.sort = raw.sort as RentalSort;

  const page = asPositiveInt(raw.page);
  if (page && page > 0) result.page = page;

  const from = asDateOnly(raw.from);
  if (from) result.from = from;

  const to = asDateOnly(raw.to);
  if (to) result.to = to;

  return result;
}

export const rentalsSearchSchema = z
  .object({
    search: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
    bucket: z.enum(RENTAL_BUCKETS).optional(),
    status: z.string().optional(),
    sort: z.enum(RENTAL_SORTS).optional(),
    page: z.number().int().min(1).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .partial();

/* ------------------------------- route params ------------------------------ */

/**
 * `/rentals/$rentalId` — a positive integer, or null.
 *
 * Returns a **number**, not the raw string. A rental is keyed by a numeric id
 * and the param is always a string, so passing the string through would let
 * `"61"` and `61` drift apart in a comparison or a cache key. Normalising here
 * means every caller downstream works with one type.
 */
export function parseRentalRouteParam(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : null;
}

/* ------------------------------- mutations --------------------------------- */

/**
 * The only value a client may send for an extension.
 *
 * `.strict()`: an unexpected key is an error rather than something quietly
 * stripped, so a body carrying `additionalCost` or `newEndDate` fails loudly
 * instead of appearing to be accepted.
 */
export const extensionRequestSchema = z
  .object({
    additionalDays: z.number().int().min(1).max(MAX_EXTENSION_DAYS),
  })
  .strict();

export const returnRequestSchema = z
  .object({
    method: z.enum(["DROP_OFF", "PICKUP"]).default("DROP_OFF"),
  })
  .strict();

/* -------------------------------- predicates ------------------------------- */

export function hasActiveRentalFilters(search: RentalsSearch): boolean {
  return Boolean(search.search || search.status || search.bucket || search.from || search.to);
}

export function activeRentalFilterCount(search: RentalsSearch): number {
  return [search.search, search.status, search.bucket, search.from, search.to].filter(Boolean)
    .length;
}
