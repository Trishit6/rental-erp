import { z } from "zod";
import {
  WALLET_FILTERS,
  WALLET_RANGES,
  type WalletFilter,
  type WalletParams,
  type WalletRange,
} from "../types";

/**
 * The wallet's URL state.
 *
 * Every field is optional for the same reason the analytics page's are: a
 * `validateSearch` return type with required fields makes the router demand `search`
 * on that route *and its children*, so every link to a child would have to carry an
 * object of defaults it does not mean. A URL's parameters are genuinely optional;
 * `WalletParams` is the total shape the page works with, and `resolveWalletParams` is
 * the only bridge.
 */
export type WalletSearch = {
  filter?: string;
  range?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
};

/**
 * ## Why the window and the filter are in the URL at all
 *
 * A wallet view is the one financial page a seller genuinely shares — with a co-owner
 * deciding whether to take a listing down, or with themselves in six weeks when they
 * ask whether the last month was better than the one before. "Last 30 days, payouts
 * only" is not a description of a dataset, it is a *decision* about a window, and it
 * is only reproducible if it travels with the link.
 *
 * It is deliberately **not** reproduced from the link alone, which is the subtlety:
 * the server resolves `?range=30d` against the request and against the browser's own
 * timezone offset, so a link opened next month reads next month *in the reader's
 * zone*. That is the intended behaviour — the words "last 30 days" have to keep
 * meaning the last thirty days — and the custom range exists for anyone who needs
 * fixed dates.
 */
export const walletSearchSchema = z.object({
  filter: z.string().trim().optional().catch(undefined),
  range: z.string().trim().optional().catch(undefined),
  from: z.string().trim().optional().catch(undefined),
  to: z.string().trim().optional().catch(undefined),
  search: z.string().trim().optional().catch(undefined),
  // TanStack Router JSON-parses search params, so `?page=2` arrives as a number.
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

/** `YYYY-MM-DD`, the only shape an `<input type="date">` produces. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isWalletFilter(value: unknown): value is WalletFilter {
  return typeof value === "string" && (WALLET_FILTERS as readonly string[]).includes(value);
}

export function isWalletRange(value: unknown): value is WalletRange {
  return typeof value === "string" && (WALLET_RANGES as readonly string[]).includes(value);
}

/**
 * Used as the route's `validateSearch`.
 *
 * Anything unrecognised is dropped rather than passed through: a mangled link should
 * land on a usable wallet page, not on one whose query the server has to refuse.
 */
export function parseWalletSearch(search: Record<string, unknown>): WalletSearch {
  const parsed = walletSearchSchema.parse(search ?? {});
  return {
    ...(isWalletFilter(parsed.filter) ? { filter: parsed.filter } : {}),
    ...(isWalletRange(parsed.range) ? { range: parsed.range } : {}),
    ...(parsed.from !== undefined && ISO_DATE.test(parsed.from) ? { from: parsed.from } : {}),
    ...(parsed.to !== undefined && ISO_DATE.test(parsed.to) ? { to: parsed.to } : {}),
    ...(parsed.search ? { search: parsed.search.slice(0, 120) } : {}),
    // Page 1 is the default and is omitted from the URL entirely, below.
    ...(parsed.page > 1 ? { page: parsed.page } : {}),
  };
}

/**
 * URL state → the total parameters the page and the request use.
 *
 * A custom window needs both ends and they must be in order. A range the date inputs
 * cannot produce falls back to 30 days rather than being sent for the server to
 * reject: a wallet showing an empty window reads as "you earned nothing", which is a
 * much worse answer than "that range was nonsense".
 */
export function resolveWalletParams(search: WalletSearch): WalletParams {
  const range = (search.range as WalletRange | undefined) ?? "30d";
  const from = search.from;
  const to = search.to;

  const usable = range === "custom" && from !== undefined && to !== undefined && from <= to;

  return {
    filter: (search.filter as WalletFilter | undefined) ?? "all",
    range: usable ? "custom" : range === "custom" ? "30d" : range,
    from: usable ? from : undefined,
    to: usable ? to : undefined,
    search: search.search ?? "",
    page: search.page ?? 1,
  };
}

/**
 * The parameters → the URL. Defaults are omitted, so links stay short.
 *
 * A `custom` window is written **only when both of its ends are present**. Writing
 * `?range=custom` alone would produce a URL that means "30 days" once it came back
 * through `resolveWalletParams` — a link whose words and whose window disagree, and
 * the one shape that could put a chip on screen describing a period the chart is not
 * drawing. Refusing to write it is cheaper than repairing it on the way back.
 */
export function toWalletSearch(params: WalletParams): WalletSearch {
  const search: WalletSearch = {};
  if (params.filter !== "all") search.filter = params.filter;

  const custom = params.range === "custom" && !!params.from && !!params.to;
  if (custom) {
    search.range = "custom";
    search.from = params.from;
    search.to = params.to;
  } else if (params.range !== "30d") {
    search.range = params.range === "custom" ? undefined : params.range;
  }

  if (params.search) search.search = params.search;
  if (params.page > 1) search.page = params.page;
  return search;
}

/** Has the seller finished typing both custom dates? Drives the Apply button. */
export function canApplyCustomRange(from: string, to: string): boolean {
  return ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to;
}

/**
 * This browser's offset from UTC, in minutes east.
 *
 * Sent with every wallet request so the server cuts "today" in the seller's own
 * timezone. Negated because `Date.getTimezoneOffset()` reports the *opposite*
 * convention — it returns `-330` in Kolkata, which is 330 minutes *ahead* of UTC.
 *
 * Read at request time rather than cached at module load, because a laptop that
 * crosses a timezone mid-session would otherwise keep asking for yesterday's window.
 */
export function timezoneOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/**
 * A stable identity for "one payout attempt".
 *
 * Generated when the request form opens and reused for every retry of that attempt,
 * so a network failure that leaves the seller unsure whether it landed produces one
 * reservation rather than two. A new key is minted only when the amount or method
 * changes, because that is a genuinely different request.
 */
export function newPayoutIdempotencyKey(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `wallet-payout-${random}`;
}
