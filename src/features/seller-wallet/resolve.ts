import { isWalletRange, type WalletSearch } from "./components/schema";
import type { WalletFilter, WalletParams, WalletRange } from "./types";

/**
 * Narrowing a partial parameter bag down to what the request actually sends.
 *
 * The wallet's *boundaries* are deliberately **not** computed here. "Today" and "This
 * year" are calendar questions and only the server, holding the seller's timezone
 * offset, can answer them correctly — so this module's whole job is to decide
 * whether a custom range is usable enough to send and to reject anything
 * out-of-vocabulary before it reaches the network.
 *
 * The consequence worth stating plainly: the chips on screen and the window in the
 * chart come from **one** server response's `range` block, not from two independent
 * calculations. There is no path where the filter says "last 7 days" and the chart
 * drew the last 30.
 */
export type ResolvedWalletRequest = {
  filter: WalletFilter;
  range: WalletRange;
  from?: string;
  to?: string;
};

/**
 * A custom window needs both ends and they have to be in order.
 *
 * A range the date inputs cannot produce falls back to 30 days rather than being sent
 * for the server to reject: a wallet showing an empty window reads as "you earned
 * nothing", which is a considerably worse answer than "that range was nonsense".
 */
/**
 * Named `…Request` rather than `resolveWalletRange` because the server already has a
 * function by the other name which does the *opposite* job — it cuts the window into
 * real timestamps. Two functions in one feature with the same name and inverse
 * purposes is a bug waiting for the day someone imports the wrong one.
 */
export function resolveWalletRequest(params: {
  range?: string;
  from?: string;
  to?: string;
}): ResolvedWalletRequest {
  const range = isWalletRange(params.range) ? params.range : "30d";
  const from = params.from;
  const to = params.to;
  const usable = range === "custom" && !!from && !!to && from <= to;

  if (range === "custom" && !usable) return { filter: "all", range: "30d" };

  return {
    filter: "all",
    range: usable ? "custom" : range,
    ...(usable ? { from, to } : {}),
  };
}

/**
 * Merge a search-bar change into the current parameters.
 *
 * Page resets to 1 for the same reason the filter chip does: page 7 of the previous
 * filter is not page 7 of this one, and keeping it would render an empty list and
 * look like the seller's history had vanished.
 */
export function withFilter(current: WalletParams, filter: WalletFilter): WalletParams {
  return { ...current, filter, page: 1 };
}

export function withRange(current: WalletParams, next: WalletSearch): WalletParams {
  const range = isWalletRange(next.range) ? next.range : current.range;
  const usable = range === "custom" && !!next.from && !!next.to && next.from <= next.to;

  return {
    ...current,
    range: usable ? "custom" : range === "custom" ? "30d" : range,
    from: usable ? next.from : undefined,
    to: usable ? next.to : undefined,
    page: 1,
  };
}

/**
 * A stable cache key for a set of parameters.
 *
 * Explicitly a **new object literal** rather than the params object itself, because
 * TanStack hashes the key structurally — and a key carrying `undefined` for an
 * omitted optional field hashes differently from one omitting it, producing two cache
 * entries for the same window.
 */
export function walletKeyOf(params: Partial<WalletParams>): Record<string, unknown> {
  return {
    filter: params.filter ?? "all",
    range: params.range ?? "30d",
    from: params.from ?? null,
    to: params.to ?? null,
    search: params.search ?? "",
    page: params.page ?? 1,
  };
}
