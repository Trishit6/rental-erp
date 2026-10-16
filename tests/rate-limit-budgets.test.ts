import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ok, onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY, type SessionUser } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import {
  InMemoryCounterStore,
  RATE_LIMITS,
  guarded,
  useRateLimitStore,
  type RateLimitBudget,
} from "../server/lib/rate-limit";
import { startRouter, type Harness } from "./support/http-harness";
import { stripComments } from "./support/source-scanning";

/**
 * PROMPT R4 — the per-endpoint budgets the security sweep adds.
 *
 * ## What a budget is, and what this file has to prove about each one
 *
 * A named budget in `server/lib/rate-limit.ts` is only a number until a route
 * names it. Two independent things can therefore be wrong, and each is caught by a
 * different half of this file:
 *
 *  1. **The registry is inert.** A budget that exists but is referenced by no route
 *     guards nothing. `every new budget is named at a real call site` reads the
 *     route sources and asserts the name appears in *code*, not in a comment — the
 *     failure mode `tests/support/source-scanning.ts` documents.
 *  2. **The limiter does not refuse.** A budget wired to a route still fails if the
 *     ceiling is off by one or the 429 escapes without `Retry-After`. The data-driven
 *     suite below drives every new budget to its exact ceiling and asserts the next
 *     call is refused with the one documented shape.
 *
 * The `auth.login` budget's real-request exhaustion is covered by
 * `tests/security-layer.test.ts`; here the counter is primed one below the limit so
 * the boundary is tested without hundreds of round trips per budget (some are
 * hundreds per minute). Priming the store is not a shortcut around the middleware —
 * the two requests after it run the real `guarded(...)` wrapper.
 */

const ROOT = join(__dirname, "..");
const IP = "203.0.113.7";

/**
 * The budgets this sweep introduces, each paired with the file that must name it.
 *
 * Keeping the file alongside the budget is the point: a budget added to the
 * registry without a call site is a rule nobody enforces, and a route naming a
 * budget that was renamed is a runtime `undefined` dereference waiting for its
 * first request.
 */
const NEW_BUDGETS: { budget: RateLimitBudget; file: string }[] = [
  { budget: "orders.action", file: "server/routes/orders.ts" },
  { budget: "reviews.write", file: "server/routes/reviews.ts" },
  { budget: "reviews.helpful", file: "server/routes/reviews.ts" },
  { budget: "reviews.reply", file: "server/routes/reviews.ts" },
  { budget: "favorites.write", file: "server/routes/market.ts" },
  { budget: "cart.write", file: "server/routes/market.ts" },
  { budget: "addresses.write", file: "server/routes/market.ts" },
  { budget: "notifications.write", file: "server/routes/notifications.ts" },
  { budget: "rentals.action", file: "server/routes/orders.ts" },
  { budget: "wallet.payout", file: "server/routes/wallet.ts" },
  { budget: "wallet.methods", file: "server/routes/wallet.ts" },
  { budget: "seller.orders", file: "server/routes/seller-orders.ts" },
  { budget: "seller.products", file: "server/routes/seller.ts" },
  { budget: "search.history", file: "server/routes/search.ts" }, // R11: recent-search writes
  { budget: "admin.mutation", file: "server/routes/admin.ts" },
];

const SESSION: SessionUser = {
  id: 1,
  name: "Test Renter",
  email: "renter@revaro.local",
  role: "USER",
  verified: true,
  avatarUrl: null,
  status: "ACTIVE",
  mustChangePassword: false,
  mustEnrollMfa: false,
  mfaEnabled: true,
};

/** A router whose only route is `POST /api/probe`, wrapped in `guarded(budget)`. */
function probeRouter(budget: RateLimitBudget, account: SessionUser | null = null): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    c.set(SESSION_USER_KEY, account);
    await next();
  });
  router.post(
    "/api/probe",
    guarded(budget, (c) => c.json(ok({ guarded: true }))),
  );
  return router;
}

/** Prime `key` exactly `count` times in a fresh store, then return it. */
async function primed(count: number, key: string, windowMs: number): Promise<InMemoryCounterStore> {
  const store = new InMemoryCounterStore();
  const now = Date.now();
  for (let i = 0; i < count; i++) await store.hit(key, windowMs, now);
  return store;
}

async function probe(harness: Harness, ip: string = IP): Promise<Response> {
  return harness.request("/api/probe", {
    method: "POST",
    headers: { "X-Forwarded-For": ip },
  });
}

beforeEach(() => {
  useRateLimitStore(new InMemoryCounterStore());
});

/* --------------------------------- registry --------------------------------- */

describe("the new budgets are registered and per-account", () => {
  it("defines a positive limit and window for every one", () => {
    for (const { budget } of NEW_BUDGETS) {
      const rule = RATE_LIMITS[budget];
      expect(rule, `${budget} is missing from RATE_LIMITS`).toBeDefined();
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowMs).toBeGreaterThan(0);
    }
  });

  it("gives every new budget a per-account bucket, not just a per-IP one", () => {
    // The whole point of the sweep: a rotating address must not defeat the budget.
    for (const { budget } of NEW_BUDGETS) {
      expect(RATE_LIMITS[budget].perAccount, `${budget} has no account bucket`).toBe(true);
    }
  });
});

/* ------------------------------- the ceilings ------------------------------- */

describe("every new budget refuses its (limit + 1)th request", () => {
  for (const { budget } of NEW_BUDGETS) {
    it(`${budget}: 429 with Retry-After once the per-IP budget is spent`, async () => {
      const rule = RATE_LIMITS[budget];
      // One below the ceiling: the next request is the last allowed, the one after
      // is the first refused. That is the boundary the off-by-one would sit on.
      useRateLimitStore(await primed(rule.limit - 1, `${budget}:ip:${IP}`, rule.windowMs));

      const harness = await startRouter(probeRouter(budget));
      try {
        const lastAllowed = await probe(harness);
        expect(lastAllowed.status, `${budget} refused its ${rule.limit}th call`).toBe(200);

        const blocked = await probe(harness);
        expect(blocked.status, `${budget} admitted its (limit + 1)th call`).toBe(429);
        expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
        const body = (await blocked.json()) as { error: { code: string } };
        expect(body.error.code).toBe("RATE_LIMITED");
      } finally {
        await harness.close();
      }
    });
  }
});

describe("the account bucket follows the identifier, not the socket", () => {
  it("refuses an authenticated account from a fresh address once its bucket is full", async () => {
    // `reviews.write` is representative: it is per-account and the assertion only
    // needs the *account* bucket to be the one that trips. Every request comes from
    // a different address, so only `acct:u:1` can be responsible.
    const budget: RateLimitBudget = "reviews.write";
    const rule = RATE_LIMITS[budget];
    useRateLimitStore(await primed(rule.limit, `${budget}:acct:u:${SESSION.id}`, rule.windowMs));

    const harness = await startRouter(probeRouter(budget, SESSION));
    try {
      const blocked = await probe(harness, "198.51.100.20");
      expect(blocked.status).toBe(429);
      const body = (await blocked.json()) as { error: { code: string } };
      expect(body.error.code).toBe("RATE_LIMITED");
    } finally {
      await harness.close();
    }
  });
});

/* ---------------------------------- wiring ---------------------------------- */

/** Every `guarded("x")` / `rateLimit("x")` budget name in a source file, comments stripped. */
function namedBudgets(source: string): string[] {
  const code = stripComments(source);
  return [...code.matchAll(/(?:guarded|rateLimit)\(\s*("([^"]+)"|\[([^\]]*)\])/g)].flatMap(
    (match) => {
      if (match[2]) return [match[2]];
      return [...(match[3] ?? "").matchAll(/"([^"]+)"/g)].map(([, name]) => name);
    },
  );
}

describe("every new budget is named at a real call site", () => {
  for (const { budget, file } of NEW_BUDGETS) {
    it(`${budget} is wired in ${file}`, () => {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(namedBudgets(source)).toContain(budget);
    });
  }

  it("names no budget that is missing from the registry", () => {
    // A drift guard in the other direction: a route pointing at a budget that was
    // renamed or never added would read `RATE_LIMITS[name].limit` and throw at
    // request time, which is exactly the failure a test should catch first.
    const files = readdirSync(join(ROOT, "server/routes")).filter((name) => name.endsWith(".ts"));
    const known = new Set(Object.keys(RATE_LIMITS));
    const offenders = files.flatMap((name) =>
      namedBudgets(readFileSync(join(ROOT, "server/routes", name), "utf8"))
        .filter((budget) => !known.has(budget))
        .map((budget) => `server/routes/${name}: ${budget}`),
    );
    expect(offenders).toEqual([]);
  });

  it("bounds admin mutations without bounding admin reads", () => {
    // The backstop is registered router-wide, so it has to exempt GET/HEAD/OPTIONS
    // explicitly rather than rely on every read route opting out. Read the source:
    // the method guard must sit above the limiter call.
    const code = stripComments(readFileSync(join(ROOT, "server/routes/admin.ts"), "utf8"));
    const guard = code.indexOf("adminMutationLimiter");
    expect(guard).toBeGreaterThan(-1);

    const block = code.slice(guard, guard + 600);
    expect(block).toMatch(/GET/);
    expect(block).toMatch(/HEAD/);
    expect(block).toMatch(/OPTIONS/);
    expect(block).toContain("adminMutationLimiter(c, next)");
  });

  it("keeps the developer's mention of a budget in prose from satisfying the scan", () => {
    // Sanity check on the scanner: a name inside a comment is not a call site.
    expect(stripComments('// guarded("orders.action")\n').trim()).toBe("");
    expect(namedBudgets('// guarded("orders.action")\n')).toEqual([]);
    // …and the array form every multi-budget call site uses is read correctly.
    expect(namedBudgets('guarded(["payments.intent", "coupon.apply"], h)')).toEqual([
      "payments.intent",
      "coupon.apply",
    ]);
  });
});
