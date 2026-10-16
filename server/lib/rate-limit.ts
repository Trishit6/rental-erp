/**
 * Rate limiting: named budgets, per-IP and per-account, with `Retry-After`.
 *
 * ## Why named budgets
 *
 * The old limiter took a bare limit and window and was free to drift: it had no
 * name, so nothing could say "search and sign-in must not share a counter"
 * except a comment at each call site, and nothing could stop a future route
 * from tightening an unrelated one. Here every budget's *identity* is part of
 * the commitment — `RATE_LIMITS` is the registry, the call sites name their
 * budget, and the two can never disagree about limits because there is only one
 * of each.
 *
 * ## Why two keys per budget
 *
 * A per-IP limit alone is defeated by a rotating address (an attacker who owns a
 * botnet has thousands); a per-account limit alone is a denial-of-service lever
 * (an attacker who knows a victim's email can drain it once, forever). A budget
 * that can afford both refuses the flood at the socket *and* follows the
 * identifier. `accountKey` is the authenticated user id where a session exists,
 * otherwise the `email` field of the body (the login / forgot case, where the
 * durable `login_attempts` lockout in `security-log.ts` is the deeper layer).
 *
 * ## Why the store is pluggable
 *
 * A fixed-window counter on each key is all the limiter needs; whether that
 * counter lives in memory or in MariaDB is a deployment question. In-memory is
 * correct for development and tests (and the seed/verification scripts), and for
 * a single-process deployment it is even production-adequate. Multi-process
 * deployments share no memory, so production defaults to the MariaDB table
 * (`rate_limit_counters`), overridable with `RATE_LIMIT_STORE=memory` for a
 * single-node worker.
 */

import { eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { rateLimitCounters } from "../schema";
import { fail } from "./api";
import type { Ctx, Middleware, Next } from "./http";
import { isProduction } from "./env";

/* --------------------------------- budgets --------------------------------- */

export type RateLimitBudget =
  | "auth.register"
  | "auth.login"
  | "auth.password"
  | "auth.refresh"
  | "auth.forgot"
  | "auth.reset"
  | "auth.mfa"
  | "auth.sessions"
  | "search"
  | "search.history"
  | "storage.upload"
  | "messages.send"
  | "social.block"
  | "reports.create"
  | "support.create"
  | "support.reply"
  | "payments.intent"
  | "coupon.apply"
  | "checkout.order"
  | "orders.action"
  | "reviews.write"
  | "reviews.helpful"
  | "reviews.reply"
  | "favorites.write"
  | "cart.write"
  | "addresses.write"
  | "notifications.write"
  | "rentals.action"
  | "wallet.payout"
  | "wallet.methods"
  | "seller.orders"
  | "seller.products"
  | "admin.action"
  | "admin.mutation";

export type RateLimitRule = {
  /** Requests allowed per `windowMs`. */
  limit: number;
  windowMs: number;
  /** Enforce a second, per-account bucket alongside the per-IP bucket. */
  perAccount?: boolean;
};

/**
 * The budget registry. One line per budget; call sites name a budget, they do not
 * restate these numbers.
 */
export const RATE_LIMITS: Record<RateLimitBudget, RateLimitRule> = {
  "auth.register": { limit: 5, windowMs: 60_000 },
  "auth.login": { limit: 10, windowMs: 60_000, perAccount: true },
  "auth.password": { limit: 5, windowMs: 60_000, perAccount: true },
  "auth.refresh": { limit: 30, windowMs: 60_000 },
  // A reset request sends mail and starts a token, so it is both expensive and
  // worth grinding; a long window with an account bucket is the shape for it.
  "auth.forgot": { limit: 5, windowMs: 15 * 60_000, perAccount: true },
  "auth.reset": { limit: 5, windowMs: 15 * 60_000, perAccount: true },
  "auth.mfa": { limit: 10, windowMs: 60_000, perAccount: true },
  "auth.sessions": { limit: 40, windowMs: 60_000 },
  search: { limit: 120, windowMs: 60_000 },
  // History writes are one suggestion box's keystrokes: a submit records at most
  // a term per navigation, so 40/min per account covers a person comfortably and
  // keeps the table from being churned by a script replaying submits.
  "search.history": { limit: 40, windowMs: 60_000, perAccount: true },
  "storage.upload": { limit: 20, windowMs: 60_000, perAccount: true },
  "messages.send": { limit: 60, windowMs: 60_000, perAccount: true },
  // Blocking and unblocking are rare, deliberate actions. A tighter budget than
  // messaging keeps a script from enumerating accounts by block/unblock timing.
  "social.block": { limit: 30, windowMs: 60_000, perAccount: true },
  // A report writes a moderation row and pings every admin. Rare and deliberate, so
  // a tight per-account budget keeps a script from flooding the queue or the admin
  // notification stream by filing hundreds of reports a minute.
  "reports.create": { limit: 20, windowMs: 60_000, perAccount: true },
  // Opening a ticket is a deliberate act that creates work for staff, so the budget is
  // tight. Replies are the normal activity of using a ticket: looser, but still bounded
  // — a support thread is not a general message channel.
  "support.create": { limit: 10, windowMs: 15 * 60_000, perAccount: true },
  "support.reply": { limit: 60, windowMs: 60_000, perAccount: true },
  // Payment intent creation, verification and cancellation share one budget: they
  // are all "spend money" actions and the provider call happens once per attempt.
  "payments.intent": { limit: 10, windowMs: 60_000, perAccount: true },
  // Coupons are applied inside the payment-intent flow today (there is no
  // standalone apply endpoint), so `/intents` consumes this budget alongside
  // `payments.intent` — the budget exists so the grind of guessing coupon codes
  // stays separate from the grind of paying, without waiting for a new endpoint.
  "coupon.apply": { limit: 10, windowMs: 60_000, perAccount: true },
  "checkout.order": { limit: 10, windowMs: 60_000, perAccount: true },
  // An order *action* (repeat a line, cancel) is a deliberate, single-purpose write
  // and is not a checkout: it must not consume the budget that guards paying. A
  // tight per-account bucket keeps a script from replaying "buy again" thousands of
  // times, which would flood the cart and notify sellers.
  "orders.action": { limit: 20, windowMs: 60_000, perAccount: true },
  // A review write recomputes the product's cached rating aggregate and notifies the
  // seller, so it is heavier than a read by orders of magnitude. 20/min is far past
  // any human's reviewing speed but well under what would let one account grind the
  // aggregate or the seller's notification feed.
  "reviews.write": { limit: 20, windowMs: 60_000, perAccount: true },
  // Marking reviews helpful is interactive: a reader browses a page and taps several.
  // 60/min stays generous for that while bounding a script that would inflate counts.
  "reviews.helpful": { limit: 60, windowMs: 60_000, perAccount: true },
  // A seller answers each review at most once, so the budget only has to bound a
  // reply flood; a per-account bucket is the whole point (the reply is public).
  "reviews.reply": { limit: 20, windowMs: 60_000, perAccount: true },
  // The wishlist: a heart tap. Generous because a shopper may save a whole page of
  // cards in one sitting, but bounded so saved-list churn cannot be scripted.
  "favorites.write": { limit: 60, windowMs: 60_000, perAccount: true },
  // Cart edits are the normal activity of shopping — add, change quantity, remove.
  // 120/min leaves a real shopper untouchable while refusing a scripted cart flood
  // that would otherwise spam the seller's low-stock alerts.
  "cart.write": { limit: 120, windowMs: 60_000, perAccount: true },
  // A saved address is rarely touched; 30/min is a comfortable ceiling for a human
  // fixing a typo repeatedly and a hard stop for address book enumeration scripts.
  "addresses.write": { limit: 30, windowMs: 60_000, perAccount: true },
  // Notification mutations are cheap but frequent (read a row, dismiss, read all).
  // 120/min covers a person clearing a backlog; the per-account bucket stops a
  // script from repeatedly rewriting the same setting or read state.
  "notifications.write": { limit: 120, windowMs: 60_000, perAccount: true },
  // Rental lifecycle actions (return request, extension request, return, cancel,
  // rent-to-own) each write a state change, a rental event and notifications, and
  // some move money. 30/min is far past human and the same bucket on every action
  // means one cannot be used to grind another.
  "rentals.action": { limit: 30, windowMs: 60_000, perAccount: true },
  // A payout request reserves balance and opens a settlement; it is rare and it is
  // money. A long window with a tight per-account bucket is the shape for it.
  "wallet.payout": { limit: 10, windowMs: 15 * 60_000, perAccount: true },
  // Adding or removing a payout destination is a deliberate settings change, not a
  // browsing action; 20/min is generous for a human and stops destination churn.
  "wallet.methods": { limit: 20, windowMs: 60_000, perAccount: true },
  // Seller-side fulfillment (single and bulk) and cancellation. The bulk path accepts
  // up to 50 orders in one request, so the count is requests, not orders: 60/min
  // covers a seller working a queue and bounds a script that would churn state.
  "seller.orders": { limit: 60, windowMs: 60_000, perAccount: true },
  // Seller product writes: create, edit, inventory, status, duplicate, archive,
  // delete. Each validates and writes a listing and may move inventory; 60/min is
  // comfortable for a seller managing a catalogue and a stop for bulk scripting.
  "seller.products": { limit: 60, windowMs: 60_000, perAccount: true },
  // RBAC grant and account-state changes take multiple round trips and must not
  // be grindable — and a single admin's mistake should not consume a shared
  // budget. 30/min per admin is dozens of role flips a minute, far past human.
  "admin.action": { limit: 30, windowMs: 60_000, perAccount: true },
  // The backstop for *every* admin mutation, so a route that forgot its own budget
  // is still bounded. Deliberately generous: an administrator doing real work may
  // touch many resources in a minute (clearing a moderation queue, re-pricing the
  // catalogue), and a per-account bucket means one admin's burst cannot lock out the
  // rest of the staff. The high-risk surfaces keep their own tighter `admin.action`.
  "admin.mutation": { limit: 300, windowMs: 60_000, perAccount: true },
};

/* ----------------------------------- store ---------------------------------- */

export type WindowObservation = { count: number; windowStartedAt: number };

/** Where counters live. Fixed window: `count` resets once `windowMs` passes. */
export interface CounterStore {
  hit(key: string, windowMs: number, now: number): Promise<WindowObservation>;
}

/** The dev/test default: a per-process `Map`, forgotten on restart. */
export class InMemoryCounterStore implements CounterStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowMs: number, now: number): Promise<WindowObservation> {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { count: 1, windowStartedAt: now };
    }
    bucket.count += 1;
    return { count: bucket.count, windowStartedAt: bucket.resetAt - windowMs };
  }

  /** For tests that need a clean slate. */
  clear(): void {
    this.buckets.clear();
  }
}

/**
 * The production store: counters persist in `rate_limit_counters`, so a fleet of
 * workers behind one database shares a single set of budgets.
 *
 * The upsert is atomic enough for the purpose: `ON DUPLICATE KEY UPDATE` runs
 * under row locking, and the expression that both resets an expired window and
 * increments a live one is evaluated against the *stored* row — a request that
 * races the window edge simply lands on one side or the other, never a torn
 * count. Expired rows are swept opportunistically after a window reset, so the
 * table never holds a counter that stopped being used.
 */
export class MariaDbCounterStore implements CounterStore {
  async hit(key: string, windowMs: number, now: number): Promise<WindowObservation> {
    const expiresAt = now + windowMs;
    await db.execute(sql`
      INSERT INTO ${rateLimitCounters} (bucket_key, count, window_started_at, expires_at)
      VALUES (${key}, 1, ${now}, ${expiresAt})
      ON DUPLICATE KEY UPDATE
        count = IF(window_started_at <= ${now}, 1, count + 1),
        expires_at = IF(window_started_at <= ${now}, ${expiresAt}, expires_at),
        window_started_at = IF(window_started_at <= ${now}, ${now}, window_started_at)
    `);
    const [row] = await db
      .select({
        count: rateLimitCounters.count,
        windowStartedAt: rateLimitCounters.windowStartedAt,
      })
      .from(rateLimitCounters)
      .where(eq(rateLimitCounters.bucketKey, key))
      .limit(1);
    if (row?.count === 1) {
      // This key just started a fresh window — prune anything past its end (only
      // mutated rows, never all rows).
      void db
        .delete(rateLimitCounters)
        .where(lt(rateLimitCounters.expiresAt, now))
        .catch(() => {});
    }
    return { count: Number(row?.count ?? 1), windowStartedAt: Number(row?.windowStartedAt ?? now) };
  }
}

let store: CounterStore = new InMemoryCounterStore();

/** Swap the store (tests). */
export function useRateLimitStore(next: CounterStore): void {
  store = next;
}

/** Point the limiter at the database table. Call once at startup. */
export function enableDatabaseRateLimiting(): void {
  store = new MariaDbCounterStore();
}

/**
 * Production defaults to the database unless `RATE_LIMIT_STORE=memory` is set
 * (a single-worker deployment that prefers no table). Everything else — dev,
 * tests, seed scripts — stays in memory.
 */
export function configureRateLimitStoreFromEnv(): void {
  if (isProduction() && process.env.RATE_LIMIT_STORE !== "memory") {
    enableDatabaseRateLimiting();
  }
}

/* -------------------------------- middleware --------------------------------- */

/** The client's address: the first `x-forwarded-for` entry, else the socket. */
export function clientIp(c: Ctx): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return c.req.raw.socket?.remoteAddress ?? "unknown";
}

/** The per-account half of a budget key, when one can be derived. */
function accountKey(c: Ctx): string | undefined {
  const user = c.get("user");
  if (user) return `u:${user.id}`;
  const body = c.req.raw.body as { email?: unknown } | undefined;
  if (body && typeof body.email === "string" && body.email.includes("@")) {
    return `e:${body.email.trim().toLowerCase()}`;
  }
  return undefined;
}

/**
 * The middleware. Names one or more budgets; every request counts against them,
 * and if any budget is exhausted the request is refused with `429` and a
 * `Retry-After` in seconds.
 */
export function rateLimit(budgets: RateLimitBudget | readonly RateLimitBudget[]): Middleware {
  const list = (Array.isArray(budgets) ? budgets : [budgets]) as RateLimitBudget[];
  return async (c: Ctx, next: Next) => {
    const now = Date.now();
    const ip = clientIp(c);
    const account = accountKey(c);

    for (const budget of list) {
      const rule = RATE_LIMITS[budget];
      const checks: Promise<WindowObservation>[] = [
        store.hit(`${budget}:ip:${ip}`, rule.windowMs, now),
      ];
      if (rule.perAccount && account !== undefined) {
        checks.push(store.hit(`${budget}:acct:${account}`, rule.windowMs, now));
      }
      const observations = await Promise.all(checks);
      for (const observation of observations) {
        if (observation.count > rule.limit) {
          const retryAfter = Math.max(
            1,
            Math.ceil((observation.windowStartedAt + rule.windowMs - now) / 1000),
          );
          c.res.setHeader("Retry-After", String(retryAfter));
          return c.json(fail("RATE_LIMITED", "Too many requests. Please slow down."), 429);
        }
      }
    }
    await next();
  };
}

/**
 * Wrap a route handler so it runs under a budget without a router-wide limiter.
 *
 * The `Router` in `lib/http` has no per-route middleware slot, so the expensive or
 * dangerous routes that must *not* be lumped with their router's reads (payment
 * intents next to the webhook, checkout next to order history) get theirs inline.
 */
export function guarded<H extends (c: Ctx) => unknown>(
  budgets: RateLimitBudget | readonly RateLimitBudget[],
  handler: H,
): H {
  const limiter = rateLimit(budgets);
  return ((c: Ctx) => limiter(c, async () => void (await handler(c)))) as H;
}
