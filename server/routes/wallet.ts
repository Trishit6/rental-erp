import { Router } from "../lib/http";
import { z } from "zod";
import { buildPagination, ok } from "../lib/api";
import { requireSeller } from "../lib/seller-access";
import {
  deletePayoutMethod,
  getPayout,
  getWalletBalance,
  getWalletBreakdown,
  getWalletSeries,
  getWalletTransaction,
  isPayoutStatus,
  listPayoutMethods,
  listPayouts,
  listWalletTransactions,
  releaseDueEarnings,
  requestPayout,
  resolveWalletFilters,
  resolveWalletRange,
  savePayoutMethod,
  MIN_PAYOUT_PAISE,
  SETTLEMENT_DELAY_DAYS,
} from "../lib/wallet";
import { db } from "../db";

/**
 * The seller wallet API.
 *
 * ## The seller is the session
 *
 * No handler in this file reads a seller id from a body, a query string or a path
 * segment. Every read takes `requireSeller(c)` and puts `user.id` — the id that came
 * out of the session cookie — into the same `WHERE` clause as everything else, and
 * every write scopes the same way. A body carrying a `sellerId` would be ignored
 * rather than obeyed, and silently ignoring one is precisely how the next maintainer
 * wires it up expecting it to do something.
 *
 * ## Ownership is in the predicate, so a stranger gets a 404
 *
 * Another seller's ledger row, payout or saved destination is *indistinguishable*
 * from one that does not exist. A 403 would confirm the id is real, which is exactly
 * what an IDOR probe is checking for.
 *
 * ## This router never moves money
 *
 * Requesting a payout reserves a balance and opens a request. Marking one paid lives
 * in `routes/admin.ts` behind `requireAdmin`, and even there it records only what an
 * administrator confirmed — no provider exists, so there is nothing that could settle
 * one. A payout that has not been confirmed must never read as paid, and the response
 * says "requested" in words rather than showing a green tick.
 */
export const walletRoute = new Router();

walletRoute.use("*", async (c, next) => {
  requireSeller(c);
  await next();
});

/* --------------------------------- overview -------------------------------- */

/**
 * `GET /api/wallet/overview` — the headline figures, the window, and a series.
 *
 * `releaseDueEarnings` runs first, and that is the only reason a read writes
 * anything: an earning older than the settlement delay becomes withdrawable the
 * moment somebody looks at their wallet, rather than whenever a background job that
 * may not be running happens to notice. It is one `UPDATE` over the eligible rows, so
 * it costs the same whether the seller has four entries or four thousand.
 *
 * The balance, the breakdown and the series are all `SUM`s in MariaDB. Nothing here
 * is added up in JavaScript, because a figure this page shows must be the same
 * figure `requestPayout` re-checks inside its own transaction.
 */
walletRoute.get("/overview", async (c) => {
  const user = requireSeller(c);
  const filters = resolveWalletFilters(c.req.query());

  await releaseDueEarnings(db, { sellerId: user.id });

  const range = resolveWalletRange(filters.range, filters.offsetMinutes);

  const [balance, breakdown, series] = await Promise.all([
    getWalletBalance(user.id),
    getWalletBreakdown(user.id, filters),
    getWalletSeries(user.id, range, filters.offsetMinutes),
  ]);

  return c.json(
    ok({
      balance,
      breakdown,
      series,
      range: {
        range: filters.range,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        bucket: range.bucket,
        /**
         * Echoed so the client can label the window. Without it a seller at `+05:30`
         * reading "Today" has no way to tell whether the boundary meant their today or
         * UTC's, and the two disagree for five and a half hours of every day.
         */
        timezoneOffsetMinutes: filters.offsetMinutes,
      },
      /** Sent rather than hardcoded in React, so the form cannot guess wrong. */
      limits: {
        minimumPayoutPaise: MIN_PAYOUT_PAISE,
        settlementDelayDays: SETTLEMENT_DELAY_DAYS,
        currency: balance.currency,
      },
    }),
  );
});

/* ------------------------------- transactions ------------------------------ */

/**
 * `GET /api/wallet/transactions` — one page of the ledger.
 *
 * Filter, search, window and pagination all run in SQL. Search covers the two
 * columns a seller could actually type — the human sentence and the public reference
 * (`RV-…`, `PAY-…`) — and deliberately never the auto-increment id, which is a row
 * count.
 */
walletRoute.get("/transactions", async (c) => {
  const user = requireSeller(c);
  const filters = resolveWalletFilters(c.req.query());
  const { rows, total } = await listWalletTransactions(user.id, filters);
  return c.json(ok(rows, buildPagination(filters.page, filters.pageSize, total)));
});

walletRoute.get("/transactions/:id{[0-9]+}", async (c) => {
  const user = requireSeller(c);
  return c.json(ok(await getWalletTransaction(user.id, Number(c.req.param("id")))));
});

/* --------------------------------- payouts --------------------------------- */

walletRoute.get("/payouts", async (c) => {
  const user = requireSeller(c);
  const filters = resolveWalletFilters(c.req.query());
  const rawStatus = c.req.query("status");

  return c.json(
    ok(
      await listPayouts(user.id, {
        // An unrecognised status degrades to "no filter" rather than a 400: the
        // window and the list are still perfectly readable, and a mangled query
        // string should not turn the whole page into an error.
        status: isPayoutStatus(rawStatus) ? rawStatus : null,
        from: filters.from,
        to: filters.to,
      }),
    ),
  );
});

walletRoute.get("/payouts/:ref", async (c) => {
  const user = requireSeller(c);
  return c.json(ok(await getPayout(user.id, c.req.param("ref"))));
});

/* ------------------------------ request a payout --------------------------- */

/**
 * `POST /api/wallet/payouts` — ask to be paid.
 *
 * ## What the schema trusts, and what it refuses
 *
 * `amount` is coerced to an integer and bounded. The ceiling is not paranoia about
 * overflow — a float that survived coercion must never reach the integer column every
 * balance is derived from.
 *
 * **`methodId` is the only other field**, and it is scoped to the seller when read.
 * There is no `sellerId` in the body, no `status`, and no amount the server has not
 * re-derived: the balance is re-read inside the payout transaction, so the figure the
 * browser displayed a moment ago is never the one that is checked.
 *
 * A client-supplied `idempotencyKey` only decides whether a retry returns the payout
 * that already exists. It cannot be pointed at another seller's key to obtain a free
 * balance check — the lookup runs after the seller lock and returns *that* seller's
 * payout or nothing.
 */
const payoutRequestSchema = z
  .object({
    /** Whole paise. A decimal here is a client bug, not something to round. */
    amount: z.coerce.number().int().min(MIN_PAYOUT_PAISE).max(1_000_000_000),
    methodId: z.coerce.number().int().positive(),
    note: z.string().trim().max(200).optional(),
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
  })
  .strict();

walletRoute.post("/payouts", async (c) => {
  const user = requireSeller(c);
  const input = payoutRequestSchema.parse(await c.req.json().catch(() => ({})));

  const result = await requestPayout({
    sellerId: user.id,
    amountPaise: input.amount,
    methodId: input.methodId,
    note: input.note ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  // A repeat request is a `200` carrying the existing payout, not a second `201`:
  // the client can tell the two apart on `created` and should not re-run its
  // confirmation.
  return c.json(ok(result), result.created ? 201 : 200);
});

/* ------------------------------ payout methods ----------------------------- */

const payoutMethodSchema = z
  .object({
    /** BANK | UPI — the two destinations the UI offers. */
    type: z.enum(["BANK", "UPI"]),
    accountHolder: z.string().trim().min(2).max(80),
    /**
     * The seller types their own masked label (`HDFC Bank •••• 4321`).
     *
     * Deliberately not a structured account-number field. There is no payout provider
     * here to tokenise a real one, so this column is the whole story — and accepting
     * an account number would mean storing bank details with no encryption, no
     * tokenisation and no way to remove them later.
     */
    maskedLabel: z.string().trim().min(4).max(80),
    isDefault: z.coerce.boolean().default(false),
  })
  .strict();

walletRoute.get("/methods", async (c) => {
  const user = requireSeller(c);
  return c.json(ok(await listPayoutMethods(user.id)));
});

walletRoute.post("/methods", async (c) => {
  const user = requireSeller(c);
  const input = payoutMethodSchema.parse(await c.req.json().catch(() => ({})));
  const created = await savePayoutMethod(user.id, input);
  return c.json(ok(created), 201);
});

walletRoute.delete("/methods/:id{[0-9]+}", async (c) => {
  const user = requireSeller(c);
  await deletePayoutMethod(user.id, Number(c.req.param("id")));
  return c.json(ok({ deleted: true }));
});
