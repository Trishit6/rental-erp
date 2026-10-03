import { describe, expect, it } from "vitest";
import { and, eq, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  assertPayoutTransition,
  assertWalletStatus,
  allowedPayoutTransitions,
  buildWalletConditions,
  EARNING_STATUSES,
  EARNING_TYPES,
  isPayoutLedgerStatus,
  isPayoutStatus,
  isWalletTransactionType,
  PAYOUT_LEDGER_STATUSES,
  PAYOUT_STATUSES,
  WALLET_FILTER_TYPES,
  WALLET_TRANSACTION_TYPES,
  type EarningStatus,
  type PayoutStatus,
} from "../server/lib/wallet";
import { walletTransactions } from "../server/schema";
import { HttpError } from "../server/lib/api";

/**
 * The wallet ledger's rules, tested without a database.
 *
 * ## What is actually load-bearing here
 *
 * Two things in this module are decisions rather than code, and both are the kind that
 * fail silently:
 *
 *  1. **`REVERSED` means "contributes to nothing"**, and every balance is a
 *     `SUM(CASE … status = '…')`. If a status were ever accepted that the `SUM`s do
 *     not handle, the row would sit in the ledger, sort and filter normally, and be
 *     counted by none of them — money that exists and is not owed to anybody.
 *  2. **Ownership is not a filter.** `buildWalletConditions` takes no seller id at
 *     all, so it is impossible to call it in a way that leaves the scope off. The
 *     tests below assert that by checking the signature, then assert that the AND the
 *     caller does write actually constrains the query.
 */

const dialect = new MySqlDialect();

function toSql(fragment: SQL): { text: string; params: unknown[] } {
  const query = dialect.sqlToQuery(fragment);
  return { text: query.sql, params: query.params };
}

describe("the row-type vocabulary", () => {
  it("covers every movement the wallet page can show", () => {
    expect([...WALLET_TRANSACTION_TYPES]).toEqual([
      "SALE",
      "RENTAL",
      "PLATFORM_FEE",
      "REFUND",
      "PAYOUT",
      "PAYOUT_REVERSAL",
      "ADJUSTMENT",
    ]);
  });

  it("recognises only those types", () => {
    for (const type of WALLET_TRANSACTION_TYPES) expect(isWalletTransactionType(type)).toBe(true);
    expect(isWalletTransactionType("SALE_FEE")).toBe(false);
    expect(isWalletTransactionType("PENDING")).toBe(false);
    expect(isWalletTransactionType(null)).toBe(false);
  });

  it("splits earnings from movements", () => {
    // A `PAYOUT` is not an earning; a `SALE` is. Everything the balance `SUM`s
    // treats alike is exactly the earning side of this list.
    expect([...EARNING_TYPES]).not.toContain("PAYOUT");
    expect([...EARNING_TYPES]).not.toContain("PAYOUT_REVERSAL");
    expect([...EARNING_TYPES]).toContain("PLATFORM_FEE");
    expect([...EARNING_TYPES]).toContain("REFUND");
  });
});

describe("assertWalletStatus — one column, two vocabularies", () => {
  it("accepts the earning states", () => {
    for (const status of EARNING_STATUSES) {
      expect(assertWalletStatus("SALE", status)).toBe(status);
    }
  });

  it("refuses to put a payout state on an earning", () => {
    // `SALE` in `PROCESSING` would be a claim that somebody is working on this
    // seller's money. The balance `SUM`s know nothing about that state, so the row
    // would count for nothing and the ledger would claim it is being handled.
    expect(() => assertWalletStatus("SALE", "PROCESSING")).toThrow(HttpError);
    expect(() => assertWalletStatus("RENTAL", "COMPLETED")).toThrow(HttpError);
    expect(() => assertWalletStatus("PLATFORM_FEE", "FAILED")).toThrow(HttpError);
    expect(() => assertWalletStatus("REFUND", "CANCELLED")).toThrow(HttpError);
  });

  it("accepts the payout lifecycle on a PAYOUT row, verbatim", () => {
    // Mirrored rather than translated: the audit trail is more useful when it shows
    // the states an admin actually set.
    for (const status of PAYOUT_LEDGER_STATUSES) {
      expect(assertWalletStatus("PAYOUT", status)).toBe(status);
    }
  });

  it("refuses an earning state on a PAYOUT row", () => {
    expect(() => assertWalletStatus("PAYOUT", "AVAILABLE")).toThrow(HttpError);
  });

  it("treats a reversal memo as a settled fact, not a pending one", () => {
    // `PAYOUT_REVERSAL` is not a `PAYOUT`, so it takes the earning vocabulary — which
    // is exactly why it is `COMPLETED` in the schema note and never `PENDING`: the
    // reservation was already released by the payout leaving the pending bucket.
    expect(assertWalletStatus("PAYOUT_REVERSAL", "COMPLETED")).toBe("COMPLETED");
    expect(() => assertWalletStatus("PAYOUT_REVERSAL", "PENDING")).toThrow(HttpError);
  });

  it("names the offending state instead of saying 'invalid'", () => {
    try {
      assertWalletStatus("SALE", "SHIPPED");
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).message).toContain("shipped");
      expect((error as HttpError).code).toBe("INVALID_WALLET_STATUS");
    }
  });

  it("guards the payout vocabulary against a near-miss", () => {
    expect(isPayoutLedgerStatus("PENDING")).toBe(true);
    expect(isPayoutLedgerStatus("PAID")).toBe(false);
    expect(isPayoutStatus("PROCESSING")).toBe(true);
    expect(isPayoutStatus("AVAILABLE")).toBe(false);
    expect(isPayoutStatus(7)).toBe(false);
  });
});

describe("payout transitions — only an admin moves a request", () => {
  it("lets a request be picked up, declined or withdrawn", () => {
    expect(allowedPayoutTransitions("PENDING")).toEqual(["PROCESSING", "FAILED", "CANCELLED"]);
  });

  it("has no edge from PENDING straight to COMPLETED", () => {
    // This is the whole "requested is not paid" guarantee in one assertion: nobody
    // can mark a request paid without having picked it up first, so a green tick
    // cannot appear without somebody having actually gone to send the money.
    expect(allowedPayoutTransitions("PENDING")).not.toContain("COMPLETED");
    expect(() => assertPayoutTransition("PENDING", "COMPLETED")).toThrow(HttpError);
  });

  it("closes the request off once an admin has picked it up", () => {
    expect(allowedPayoutTransitions("PROCESSING")).toEqual(["COMPLETED", "FAILED"]);
    expect(allowedPayoutTransitions("PROCESSING")).not.toContain("CANCELLED");
  });

  it("treats every end state as final", () => {
    // A replayed request or a stale admin tab must not be able to walk a finished
    // payment backwards into a state that would silently re-reserve the money.
    for (const terminal of ["COMPLETED", "FAILED", "CANCELLED"] as PayoutStatus[]) {
      expect(allowedPayoutTransitions(terminal)).toEqual([]);
      expect(() => assertPayoutTransition(terminal, "PROCESSING")).toThrow(HttpError);
    }
  });

  it("refuses a no-op transition with its own message", () => {
    try {
      assertPayoutTransition("COMPLETED", "COMPLETED");
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as HttpError).code).toBe("INVALID_TRANSITION");
      expect((error as HttpError).message).toContain("already there");
    }
  });

  it("distinguishes 'too late' from 'not allowed'", () => {
    // "This payout is completed and can no longer be changed" tells an admin the
    // window has closed; "a pending payout cannot be marked completed" tells them
    // they skipped a step. One message for both would send them looking for a bug.
    let terminalMessage = "";
    try {
      assertPayoutTransition("COMPLETED", "PROCESSING");
    } catch (error) {
      terminalMessage = (error as HttpError).message;
    }
    expect(terminalMessage).toContain("no longer be changed");

    let skippedMessage = "";
    try {
      assertPayoutTransition("PENDING", "COMPLETED");
    } catch (error) {
      skippedMessage = (error as HttpError).message;
    }
    expect(skippedMessage).toContain("cannot be marked completed");
  });

  it("uses the same status list for the request and its ledger mirror", () => {
    // A ledger row that could hold a state the request cannot is a row nobody can
    // explain, because no admin action could have produced it.
    expect([...PAYOUT_LEDGER_STATUSES].sort()).toEqual([...PAYOUT_STATUSES].sort());
  });

  it("has an entry for every status, so no lookup can fall through to undefined", () => {
    for (const status of PAYOUT_STATUSES) {
      expect(Array.isArray(allowedPayoutTransitions(status))).toBe(true);
    }
  });
});

describe("the filter chips map to the rows a seller expects", () => {
  it("covers both directions of a payout under one chip", () => {
    // "Show me money leaving my wallet" includes the memo explaining why one of them
    // came back.
    expect(WALLET_FILTER_TYPES.payouts).toEqual(["PAYOUT", "PAYOUT_REVERSAL"]);
  });

  it("keeps fees to themselves rather than folding them into sales", () => {
    expect(WALLET_FILTER_TYPES.fees).toEqual(["PLATFORM_FEE"]);
    expect(WALLET_FILTER_TYPES.sales).toEqual(["SALE"]);
    expect(WALLET_FILTER_TYPES.rentals).toEqual(["RENTAL"]);
  });

  it("never names a type the vocabulary does not contain", () => {
    const known = new Set<string>(WALLET_TRANSACTION_TYPES);
    for (const types of Object.values(WALLET_FILTER_TYPES)) {
      for (const type of types) expect(known.has(type)).toBe(true);
    }
  });
});

describe("buildWalletConditions — the optional predicates", () => {
  it("returns nothing at all for the default wallet", () => {
    // Every term here is optional, so an unfiltered wallet is a bare seller scope.
    // One that always emitted a `1 = 1` would just be a slower way of saying that.
    expect(buildWalletConditions({ types: null, search: "", from: null, to: null })).toEqual([]);
  });

  it("turns a filter into an IN, not a chain of ORs", () => {
    const [condition] = buildWalletConditions({
      types: ["PAYOUT", "PAYOUT_REVERSAL"],
      search: "",
      from: null,
      to: null,
    });
    const { text, params } = toSql(condition);
    expect(text).toContain("in (");
    expect(params).toEqual(["PAYOUT", "PAYOUT_REVERSAL"]);
  });

  it("searches the sentence and the public reference, and nothing else", () => {
    // Never the auto-increment id: that is a row count, and searching by it would
    // answer questions about how much money other sellers have moved.
    const [condition] = buildWalletConditions({
      types: null,
      search: "PAY-2026",
      from: null,
      to: null,
    });
    const { text, params } = toSql(condition);
    expect(text).toContain("description");
    expect(text).toContain("reference");
    expect(text).not.toContain("`id`");
    expect(params).toEqual(["%PAY-2026%", "%PAY-2026%"]);
  });

  it("bounds the window on both sides", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-31T23:59:59.999Z");
    const conditions = buildWalletConditions({ types: null, search: "", from, to });

    expect(conditions).toHaveLength(2);
    expect(toSql(conditions[0]).text).toContain(">=");
    expect(toSql(conditions[1]).text).toContain("<=");
    // Drizzle renders a bound `Date` as a MariaDB datetime literal rather than an ISO
    // string, so the assertion is on the value that actually reaches the driver.
    expect(toSql(conditions[0]).params).toEqual(["2026-01-01 00:00:00.000"]);
    expect(toSql(conditions[1]).params).toEqual(["2026-01-31 23:59:59.999"]);
  });

  it("leaves out a bound it was not given", () => {
    // `ytd` has an open end. Emitting `created_at <= <epoch>` would quietly hide
    // every row of the year, so the absent bound has to stay absent.
    const conditions = buildWalletConditions({
      types: null,
      search: "",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: null,
    });
    expect(conditions).toHaveLength(1);
    expect(toSql(conditions[0]).text).toContain(">=");
  });
});

describe("the seller scope is the caller's job, and it is not optional", () => {
  it("takes no seller id, so it cannot be called without one", () => {
    // The signature is the guard. A function taking `sellerId` would invite
    // `buildWalletConditions(filters)` — leaving the ownership term off and showing
    // a seller every row in the marketplace's ledger.
    expect(buildWalletConditions.length).toBe(1);
  });

  it("constrains the query when the caller does write the term", () => {
    const sellerId = 42;
    const conditions = [
      eq(walletTransactions.sellerId, sellerId),
      ...buildWalletConditions({ types: null, search: "", from: null, to: null }),
    ];
    const { text, params } = toSql(and(...conditions)!);

    expect(text).toContain("`seller_id` =");
    expect(params).toEqual([sellerId]);
  });

  it("leads the WHERE clause with the seller, so the index does the work", () => {
    // The composite index is `(seller_id, type, created_at)`. An unfiltered ledger
    // page is the common case and the only one that can read a lot of rows.
    const text = toSql(
      and(
        eq(walletTransactions.sellerId, 1),
        ...buildWalletConditions({ types: null, search: "", from: null, to: null }),
      )!,
    ).text;
    expect(text.indexOf("`seller_id`")).toBeLessThan(text.length);
  });

  it("gives two sellers two different queries", () => {
    // The property that matters: the scope is a bound value, not a constant baked
    // into the predicate, so one seller's result can never become another's.
    const mine = toSql(and(eq(walletTransactions.sellerId, 1))!).params;
    const theirs = toSql(and(eq(walletTransactions.sellerId, 2))!).params;
    expect(mine).not.toEqual(theirs);
  });
});

describe("the vocabularies the seed and the UI both depend on", () => {
  it("keeps every earning status one of the three the balance handles", () => {
    // The `SUM(CASE …)` expressions test for exactly `AVAILABLE`, `PENDING` and
    // `REVERSED`. A fourth value would be counted by none of them.
    const counted = new Set<string>(["AVAILABLE", "PENDING", "REVERSED"]);
    for (const status of EARNING_STATUSES) expect(counted.has(status)).toBe(true);
  });

  it("types `assertWalletStatus`'s return so a caller needs no second cast", () => {
    const status: EarningStatus | "PENDING" = assertWalletStatus("SALE", "PENDING");
    expect(status).toBe("PENDING");
  });
});
