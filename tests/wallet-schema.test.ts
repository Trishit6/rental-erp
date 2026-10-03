import { describe, expect, it } from "vitest";
import {
  canApplyCustomRange,
  isWalletFilter,
  isWalletRange,
  newPayoutIdempotencyKey,
  parseWalletSearch,
  resolveWalletParams,
  timezoneOffsetMinutes,
  toWalletSearch,
  walletSearchSchema,
} from "../src/features/seller-wallet/components/schema";
import {
  resolveWalletRequest,
  walletKeyOf,
  withFilter,
  withRange,
} from "../src/features/seller-wallet/resolve";
import { WALLET_FILTERS, WALLET_RANGES } from "../src/features/seller-wallet/types";

/**
 * The wallet's URL state.
 *
 * ## Why the URL and not component state
 *
 * A wallet view is the one financial page a seller genuinely shares — with a co-owner
 * deciding whether to take a listing down, or with themselves in six weeks when they
 * ask whether last month was better than the month before. "Last 30 days, payouts
 * only" is a *decision* about a window, and it is only reproducible if it travels
 * with the link. That is also why `filter` and `range` are parsed once here rather
 * than read out of `useState` in the page.
 *
 * ## The subtle half, which is not tested anywhere else
 *
 * These tests assert that the *window* survives the round trip. They cannot assert
 * what the window *means*, because the browser does not decide that — the server
 * resolves `range=today` against the request's own moment and the offset sent
 * alongside it. So the invariant proved here is the weaker but real one: whatever the
 * seller chose comes back out unchanged, and nothing silently rewrites their choice.
 */

/**
 * Parses a real query string the way the router does.
 *
 * TanStack Router JSON-parses search params, so `?page=2` arrives as a number and
 * `?filter=sales` as a string. Going through `URLSearchParams` and `Object.fromEntries`
 * reproduces the strings faithfully while leaving `page` as a string, so both shapes
 * are covered by `parseWalletSearch` taking `Record<string, unknown>`.
 */
function parse(query: string) {
  const raw: Record<string, unknown> = Object.fromEntries(new URLSearchParams(query));
  return parseWalletSearch(raw);
}

describe("parseWalletSearch — the URL is untrusted input", () => {
  it("keeps a filter and a window the page understands", () => {
    expect(parse("filter=payouts&range=90d")).toEqual({ filter: "payouts", range: "90d" });
  });

  it("drops a filter or window it does not, rather than passing it to the server", () => {
    // A mangled bookmark must land on a usable wallet, not on one the server has to
    // refuse — and it must not reach the network as a value nothing validates.
    expect(parse("filter=everything&range=lifetime")).toEqual({});
    // The customer's payment status is not a wallet filter.
    expect(parse("filter=SUCCEEDED")).toEqual({});
  });

  it("accepts only the shapes a date input can produce", () => {
    expect(parse("range=custom&from=2026-01-01&to=2026-03-31")).toEqual({
      range: "custom",
      from: "2026-01-01",
      to: "2026-03-31",
    });
    // A full timestamp is not what `<input type="date">` emits, and accepting it
    // would let a query string smuggle in a range the date fields cannot show back.
    expect(parse("from=2026-01-01T00%3A00%3A00Z")).toEqual({});
    expect(parse("from=01-01-2026")).toEqual({});
  });

  it("omits page 1 entirely, so a default wallet link stays short", () => {
    expect(parse("")).toEqual({});
    expect(parse("page=1")).toEqual({});
    expect(parse("page=3")).toEqual({ page: 3 });
  });

  it("truncates an unbounded search term", () => {
    const long = "x".repeat(400);
    expect(parse(`search=${long}`).search).toHaveLength(120);
  });

  it("degrades a nonsense page instead of throwing at the route", () => {
    // A thrown `validateSearch` is a router error boundary, not a wallet page.
    expect(parseWalletSearch({ page: "abc" })).toEqual({});
    expect(parseWalletSearch({ page: -4 })).toEqual({});
    expect(walletSearchSchema.safeParse({ page: "abc" }).success).toBe(true);
  });

  it("survives being handed nothing at all", () => {
    expect(parseWalletSearch(undefined as unknown as Record<string, unknown>)).toEqual({});
  });
});

describe("resolveWalletParams — URL state to the shape the page works with", () => {
  it("fills in the defaults rather than leaving them undefined", () => {
    expect(resolveWalletParams({})).toEqual({
      filter: "all",
      range: "30d",
      from: undefined,
      to: undefined,
      search: "",
      page: 1,
    });
  });

  it("carries a usable custom range straight through", () => {
    const params = resolveWalletParams({
      range: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(params.range).toBe("custom");
    expect(params.from).toBe("2026-01-01");
    expect(params.to).toBe("2026-01-31");
  });

  it("refuses a custom range that is unusable, and says so with 30 days", () => {
    // Three ways to be unusable: missing an end, inverted ends, or no dates at all.
    for (const search of [
      { range: "custom", from: "2026-01-01" },
      { range: "custom", from: "2026-03-31", to: "2026-01-01" },
      { range: "custom" },
    ]) {
      const params = resolveWalletParams(search);
      expect(params.range).toBe("30d");
      expect(params.from).toBeUndefined();
      expect(params.to).toBeUndefined();
    }
  });

  it("accepts a single-day custom range", () => {
    // `from === to` is a whole day in the seller's own zone, not an empty window.
    const params = resolveWalletParams({
      range: "custom",
      from: "2026-04-01",
      to: "2026-04-01",
    });
    expect(params.range).toBe("custom");
  });
});

describe("toWalletSearch — the round trip that keeps a shared link honest", () => {
  it("writes nothing for a default wallet", () => {
    expect(toWalletSearch({ filter: "all", range: "30d", search: "", page: 1 })).toEqual({});
  });

  it("returns every non-default choice to the parser unchanged", () => {
    const params = {
      filter: "payouts",
      range: "custom",
      from: "2026-02-01",
      to: "2026-02-28",
      search: "PAY-",
      page: 4,
    } as const;
    expect(resolveWalletParams(parseWalletSearch(toWalletSearch(params)))).toEqual(params);
  });

  it("never writes a custom range without both of its ends", () => {
    // A half-written window in the URL is the one shape that could make the chart and
    // the ledger describe different periods.
    const search = toWalletSearch({
      filter: "all",
      range: "custom",
      from: "2026-02-01",
      search: "",
      page: 1,
    });
    expect(search.range).toBeUndefined();
  });
});

describe("changing a chip resets the page", () => {
  const current = { filter: "all", range: "30d", search: "", page: 7 } as const;

  it("because page 7 of the old filter is not page 7 of this one", () => {
    // Keeping it would render an empty list and read as "your history has vanished".
    expect(withFilter(current, "refunds").page).toBe(1);
    expect(withRange(current, { range: "today" }).page).toBe(1);
  });

  it("keeps the search term, so a reference being chased is not lost", () => {
    const searching = { ...current, search: "PAY-2026" } as const;
    expect(withFilter(searching, "payouts").search).toBe("PAY-2026");
  });

  it("clears a stale custom window when a fixed chip is chosen", () => {
    const custom = { ...current, range: "custom", from: "2026-01-01", to: "2026-01-31" } as const;
    const next = withRange(custom, { range: "7d" });
    expect(next.range).toBe("7d");
    expect(next.from).toBeUndefined();
    expect(next.to).toBeUndefined();
  });

  it("refuses to apply an inverted custom range", () => {
    const next = withRange(current, {
      range: "custom",
      from: "2026-03-31",
      to: "2026-01-01",
    });
    expect(next.range).toBe("30d");
  });
});

describe("the query key is a signature, not a bag of optionals", () => {
  it("produces the same key for the same parameters", () => {
    expect(walletKeyOf({ filter: "sales", range: "7d", page: 2 })).toEqual(
      walletKeyOf({ filter: "sales", range: "7d", page: 2 }),
    );
  });

  it("produces one key whether the custom dates are present or omitted", () => {
    // TanStack hashes structurally, and an explicit `undefined` hashes differently
    // from an absent field — which would give the same window two cache entries.
    expect(walletKeyOf({ range: "custom", from: "2026-01-01", to: "2026-01-31" })).toEqual(
      walletKeyOf({ range: "custom", from: "2026-01-01", to: "2026-01-31" }),
    );
    expect(walletKeyOf({}).from).toBeNull();
    expect(walletKeyOf({}).to).toBeNull();
  });

  it("never mints a key for two different windows", () => {
    const keys = new Set([
      JSON.stringify(walletKeyOf({ filter: "sales", range: "7d", page: 1 })),
      JSON.stringify(walletKeyOf({ filter: "rentals", range: "7d", page: 1 })),
      JSON.stringify(walletKeyOf({ filter: "sales", range: "30d", page: 1 })),
      JSON.stringify(walletKeyOf({ filter: "sales", range: "7d", page: 2 })),
    ]);
    expect(keys.size).toBe(4);
  });
});

describe("the request helper agrees with the route parser", () => {
  it("never sends a custom range the URL state would not have accepted", () => {
    // `resolveWalletRequest` is what `api.ts` calls before every wallet fetch, so a
    // disagreement here would put a window in the query string that the chips on
    // screen do not describe.
    const resolved = resolveWalletRequest({ range: "custom", from: "2026-05-01" });
    expect(resolved.range).toBe("30d");
    expect(resolved.from).toBeUndefined();
  });

  it("passes a usable custom range through", () => {
    expect(resolveWalletRequest({ range: "custom", from: "2026-05-01", to: "2026-05-31" })).toEqual(
      { filter: "all", range: "custom", from: "2026-05-01", to: "2026-05-31" },
    );
  });

  it("falls back to 30 days for a range the vocabulary does not contain", () => {
    expect(resolveWalletRequest({ range: "quarter" }).range).toBe("30d");
  });
});

describe("guards the components lean on", () => {
  it("recognises exactly the chips the page offers", () => {
    for (const filter of WALLET_FILTERS) expect(isWalletFilter(filter)).toBe(true);
    for (const range of WALLET_RANGES) expect(isWalletRange(range)).toBe(true);
    expect(isWalletFilter("PAYOUT")).toBe(false);
    expect(isWalletRange("7D")).toBe(false);
    expect(isWalletFilter(undefined)).toBe(false);
  });

  it("only enables Apply on a range the date fields can actually produce", () => {
    expect(canApplyCustomRange("2026-01-01", "2026-01-31")).toBe(true);
    expect(canApplyCustomRange("2026-01-01", "2026-01-01")).toBe(true);
    expect(canApplyCustomRange("2026-01-31", "2026-01-01")).toBe(false);
    expect(canApplyCustomRange("2026-01-01", "")).toBe(false);
    expect(canApplyCustomRange("", "")).toBe(false);
  });

  it("reports the browser's offset east of UTC", () => {
    // `getTimezoneOffset` uses the opposite convention: it returns −330 in Kolkata.
    const reported = timezoneOffsetMinutes();
    expect(reported).toBe(-new Date().getTimezoneOffset());
    expect(Number.isInteger(reported)).toBe(true);
  });
});

describe("the payout idempotency key", () => {
  it("names the attempt so a retry is recognisable server-side", () => {
    // Prefixed, because the server's floor is 8 characters and a bare UUID would
    // satisfy it by luck rather than by intent.
    expect(newPayoutIdempotencyKey()).toMatch(/^wallet-payout-.+/);
  });

  it("is different for every attempt", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newPayoutIdempotencyKey()));
    expect(keys.size).toBe(50);
  });
});
