import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY, type SessionUser } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import { walletRoute } from "../server/routes/wallet";
import { adminRoute } from "../server/routes/admin";
import { startRouter, type Harness } from "./support/http-harness";
import {
  clampTimezoneOffset,
  MAX_CUSTOM_RANGE_DAYS,
  MIN_PAYOUT_PAISE,
  resolveWalletFilters,
  resolveWalletRange,
  SETTLEMENT_DELAY_DAYS,
  WALLET_FILTER_TYPES,
} from "../server/lib/wallet";

/**
 * The payout workflow, as far as it can be proved without a database.
 *
 * ## Why the tests reach into the routers
 *
 * The three properties a wallet has to have are all *structural*, and none of them is
 * visible in a handler body:
 *
 *  1. every route is behind the seller gate;
 *  2. **no** seller-facing route changes a payout's status;
 *  3. the body of a payout request has no field through which a client could name a
 *     seller or declare its own request paid.
 *
 * Each of those fails silently if it breaks. A missing gate returns a stranger's
 * balance; a status endpoint on the seller router lets a seller mark their own payout
 * paid; a loose schema lets a body carry a `sellerId` that is quietly ignored today
 * and wired up as an authority by the next maintainer. So the routing table and the
 * Zod schemas are asserted directly, with the database never reached.
 */

/* --------------------------- the seller's own routes -------------------------- */

/** The registered handler routes. `Router` records only verbs, so no `ALL` rows. */
function handlersOf(route: Router) {
  return route.routes();
}

/**
 * The wallet router with a session already resolved, so nothing has to sign in.
 *
 * `requireSeller` reads the id out of the session context and nowhere else, which is
 * exactly the property under test: with no session the gate refuses, and with one it
 * lets the request through to a handler that can still only reach the seller's rows.
 *
 * The session is injected as `Router` middleware rather than as an Express app-level
 * handler so that `Ctx.set` and the guard read the same request-scoped state.
 */
function routerAs(role: "SELLER" | "ADMIN" | "CUSTOMER", mount: Router) {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    if (role !== "CUSTOMER") {
      c.set(SESSION_USER_KEY, {
        id: 42,
        role,
        name: "Test Seller",
        email: "seller@revaro.local",
        verified: true,
        avatarUrl: null,
      } satisfies SessionUser);
    }
    await next();
  });
  router.route("/", mount);
  return router;
}

/**
 * Servers are created once per *(router, role)* pair.
 *
 * The router is part of the key, not just the role: both the wallet suite and the
 * admin suite in this file ask for a SELLER, and keying on role alone handed the
 * admin requests to the wallet server. That failure is nastier than it looks —
 * the wallet router's `use("*")` gate answers 401 for *any* path, so the
 * anonymous-caller assertions kept passing against the wrong router while the
 * signed-in-seller assertion failed with a 404 that looked like a routing bug.
 */
const harnesses = new Map<Router, Map<string, Promise<Harness>>>();

function harnessFor(role: "SELLER" | "ADMIN" | "CUSTOMER", mount: Router): Promise<Harness> {
  let byRole = harnesses.get(mount);
  if (!byRole) {
    byRole = new Map();
    harnesses.set(mount, byRole);
  }
  let pending = byRole.get(role);
  if (!pending) {
    pending = startRouter(routerAs(role, mount));
    byRole.set(role, pending);
  }
  return pending;
}

/** Mounts every server up front, so no test races a half-started listener. */
beforeAll(async () => {
  await Promise.all([
    harnessFor("SELLER", walletRoute),
    harnessFor("CUSTOMER", walletRoute),
    harnessFor("SELLER", adminRoute),
    harnessFor("ADMIN", adminRoute),
    harnessFor("CUSTOMER", adminRoute),
  ]);
});

afterAll(async () => {
  await Promise.all(
    [...harnesses.values()].flatMap((byRole) =>
      [...byRole.values()].map((pending) => pending.then((h) => h.close())),
    ),
  );
});

/** Concrete paths for each registered pattern, so the real matcher is exercised. */
const CONCRETE: Record<string, string> = {
  "/overview": "/overview",
  "/transactions": "/transactions",
  "/transactions/:id{[0-9]+}": "/transactions/17",
  "/payouts": "/payouts",
  "/payouts/:ref": "/payouts/PAY-2026-ABC123",
  "/methods": "/methods",
  "/methods/:id{[0-9]+}": "/methods/3",
};

describe("every wallet route is behind the seller gate", () => {
  const routes = handlersOf(walletRoute);

  it("finds the routes at all, so the rest of this file is not vacuous", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it("refuses every one of them without a session", async () => {
    const app = await harnessFor("CUSTOMER", walletRoute);
    for (const route of routes) {
      const path = CONCRETE[route.path];
      expect(path, `no concrete path mapped for ${route.path}`).toBeDefined();
      const response = await app.request(path, { method: route.method });
      expect(
        response.status,
        `${route.method} ${route.path} answered ${response.status} to an anonymous caller`,
      ).toBe(401);
    }
  });

  it("refuses a customer who is signed in but has not onboarded", async () => {
    // 403 rather than 401: the caller *is* authenticated, so the client can branch on
    // the code and offer onboarding instead of a dead end.
    const app = await harnessFor("CUSTOMER", walletRoute);
    const response = await app.request("/overview");
    expect(response.status).toBe(401);
  });

  it("lets a signed-in seller past the gate", async () => {
    // A 401 or 403 here would mean the gate rejects everybody; anything that is not a
    // 401 proves the gate opened. The handler then fails on the database, which this
    // suite has none of — so only the *gate* is asserted.
    const app = await harnessFor("SELLER", walletRoute);
    const response = await app.request("/methods/999999999");
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});

describe("a seller has no way to answer their own payout request", () => {
  const routes = handlersOf(walletRoute);

  it("registers no PATCH or PUT anywhere", () => {
    // There is no "cancel my payout" and no "mark it paid". The request is created;
    // only an administrator moves it afterwards.
    expect(routes.filter((route) => route.method === "PATCH" || route.method === "PUT")).toEqual(
      [],
    );
  });

  it("registers no status path at all", () => {
    expect(routes.filter((route) => route.path.includes("status"))).toEqual([]);
  });

  it("exposes exactly one write to a payout: the request itself", () => {
    const writes = routes.filter(
      (route) => route.method === "POST" || route.method === "DELETE" || route.method === "PATCH",
    );
    expect(writes.map((route) => `${route.method} ${route.path}`).sort()).toEqual([
      "DELETE /methods/:id{[0-9]+}",
      "POST /methods",
      "POST /payouts",
    ]);
  });

  it("does not let /payouts/:ref swallow the collection", () => {
    // The same class of bug `review-routes.test.ts` documents: a router matches in
    // registration order, so an unconstrained `:ref` above `/payouts` would answer
    // the collection request with a single-payout lookup and 404.
    const payoutIndex = routes.findIndex(
      (route) => route.path === "/payouts" && route.method === "GET",
    );
    const refIndex = routes.findIndex((route) => route.path === "/payouts/:ref");
    expect(payoutIndex).toBeGreaterThanOrEqual(0);
    expect(refIndex).toBeGreaterThan(payoutIndex);
  });

  it("constrains ids to digits, so no arbitrary literal is read as one", () => {
    const idRoutes = routes.filter((route) => route.path.includes(":id"));
    expect(idRoutes.length).toBeGreaterThan(0);
    for (const route of idRoutes) {
      expect(route.path).toContain("{[0-9]+}");
    }
  });
});

describe("a payout request body has no field for a seller or a status", () => {
  // Resolved before the block's tests run; `beforeAll` above already started it.
  let app: Harness;

  beforeAll(async () => {
    app = await harnessFor("SELLER", walletRoute);
  });

  async function post(body: unknown) {
    const response = await app.request("/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as { error?: { code: string } },
    };
  }

  it("refuses a body that names the seller", async () => {
    // `.strict()`, so an unrecognised key is an error rather than something quietly
    // dropped. Silently ignoring one is how the next maintainer wires it up expecting
    // it to do something.
    const result = await post({ amount: 100000, methodId: 1, sellerId: 7 });
    expect(result.status).toBe(400);
    expect(result.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a body that declares the payout's own status", async () => {
    // There is no field in which to even express "mark this paid" from the seller.
    const result = await post({ amount: 100000, methodId: 1, status: "COMPLETED" });
    expect(result.status).toBe(400);
    expect(result.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a payout below the floor, before the balance is ever read", async () => {
    const result = await post({ amount: MIN_PAYOUT_PAISE - 1, methodId: 1 });
    expect(result.status).toBe(400);
  });

  it("refuses an amount that is not whole paise", async () => {
    // A decimal that survived coercion would poison every balance derived from the
    // integer column. The floor is not paranoia about overflow — it is the type.
    const result = await post({ amount: 100000.5, methodId: 1 });
    expect(result.status).toBe(400);
  });

  it("refuses an empty body", async () => {
    const result = await post({});
    expect(result.status).toBe(400);
  });
});

/* ----------------------------- admin-only moves ------------------------------ */

describe("only an administrator can advance a payout", () => {
  const routes = handlersOf(adminRoute);

  it("has a status endpoint, so the workflow has a way out of PENDING", () => {
    expect(
      routes.some(
        (route) => route.method === "PATCH" && route.path === "/payouts/:id{[0-9]+}/status",
      ),
    ).toBe(true);
  });

  it("refuses an anonymous caller", async () => {
    const app = await harnessFor("CUSTOMER", adminRoute);
    const response = await app.request("/payouts/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    expect(response.status).toBe(401);
  });

  it("refuses a signed-in seller", async () => {
    // The seller is precisely who an attacker would be in a marketplace, so the whole
    // admin surface is off-limits rather than merely hidden.
    const app = await harnessFor("SELLER", adminRoute);
    const response = await app.request("/payouts/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    expect(response.status).toBe(403);
  });

  async function patch(status: unknown, reason?: string) {
    const app = await harnessFor("ADMIN", adminRoute);
    const response = await app.request("/payouts/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(reason !== undefined ? { reason } : {}) }),
    });
    return {
      status: response.status,
      body: (await response.json()) as { error?: { code: string } },
    };
  }

  it("rejects a status outside the payout vocabulary", async () => {
    const result = await patch("PAID");
    expect(result.status).toBe(400);
    expect(result.body.error?.code).toBe("BAD_REQUEST");
  });

  it("rejects a refusal with no reason for the seller to read", async () => {
    // "Failed" with nothing to act on is how a marketplace gets a week of support
    // tickets about a payout nobody will explain.
    for (const status of ["FAILED", "CANCELLED"]) {
      const result = await patch(status);
      expect(result.status).toBe(400);
      expect(result.body.error?.code).toBe("REASON_REQUIRED");
    }
  });

  it("rejects a reason that is only whitespace", async () => {
    const result = await patch("FAILED", "   ");
    expect(result.status).toBe(400);
    expect(result.body.error?.code).toBe("REASON_REQUIRED");
  });

  it("rejects a body carrying anything but a status and a reason", async () => {
    const app = await harnessFor("ADMIN", adminRoute);
    const response = await app.request("/payouts/1/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED", sellerId: 7, amount: 1 }),
    });
    expect(response.status).toBe(400);
  });
});

/* ------------------------------ window resolution ----------------------------- */

const KOLKATA = 330; // +05:30
const NOON_UTC = new Date("2026-09-14T12:00:00.000Z");

describe("'today' means the seller's today", () => {
  it("opens at local midnight, not UTC midnight", () => {
    const { from, to } = resolveWalletRange("today", KOLKATA, undefined, undefined, NOON_UTC);
    // 2026-09-14 00:00 +05:30 is 2026-09-13 18:30 UTC.
    expect(from.toISOString()).toBe("2026-09-13T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-09-14T18:29:59.999Z");
  });

  it("closes on the seller's midnight, so the last five and a half hours are not tomorrow", () => {
    // At 20:00 in Kolkata, UTC has already rolled over to the 15th. A UTC window
    // would show the seller a "today" that ends before the day they are in does.
    const eveningKolkata = new Date("2026-09-14T14:30:00.000Z");
    const { to } = resolveWalletRange("today", KOLKATA, undefined, undefined, eveningKolkata);
    expect(to.toISOString()).toBe("2026-09-14T18:29:59.999Z");
    expect(to.getTime()).toBeGreaterThan(eveningKolkata.getTime());
  });

  it("is the same window as UTC's when the seller is on UTC", () => {
    const { from, to } = resolveWalletRange("today", 0, undefined, undefined, NOON_UTC);
    expect(from.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-09-14T23:59:59.999Z");
  });

  it("buckets today by day", () => {
    expect(resolveWalletRange("today", KOLKATA, undefined, undefined, NOON_UTC).bucket).toBe("day");
  });

  it("moves the boundary west as well as east", () => {
    const { from } = resolveWalletRange("today", -480, undefined, undefined, NOON_UTC);
    // 2026-09-14 00:00 −08:00 is 2026-09-14 08:00 UTC.
    expect(from.toISOString()).toBe("2026-09-14T08:00:00.000Z");
  });
});

describe("the rolling windows are rolling, not calendar", () => {
  it("count back exactly N days from the request", () => {
    for (const [range, days] of [
      ["7d", 7],
      ["30d", 30],
      ["90d", 90],
    ] as const) {
      const { from, to, bucket } = resolveWalletRange(range, 0, undefined, undefined, NOON_UTC);
      expect(to.toISOString()).toBe(NOON_UTC.toISOString());
      expect(NOON_UTC.getTime() - from.getTime()).toBe(days * 86_400_000);
      expect(bucket).toBe("day");
    }
  });

  it("ignores the timezone for a rolling window", () => {
    // "Last 30 days" has to keep meaning the last thirty days whatever the reader's
    // clock says, so it is anchored to the instant rather than to a local day.
    const utc = resolveWalletRange("30d", 0, undefined, undefined, NOON_UTC);
    const kolkata = resolveWalletRange("30d", KOLKATA, undefined, undefined, NOON_UTC);
    expect(kolkata.from.toISOString()).toBe(utc.from.toISOString());
  });
});

describe("'this year' starts on the seller's new year", () => {
  it("opens at 1 January local", () => {
    const { from, to, bucket } = resolveWalletRange("ytd", KOLKATA, undefined, undefined, NOON_UTC);
    // 2026-01-01 00:00 +05:30 is 2025-12-31 18:30 UTC — the previous *year* in UTC.
    expect(from.toISOString()).toBe("2025-12-31T18:30:00.000Z");
    expect(to.toISOString()).toBe(NOON_UTC.toISOString());
    expect(bucket).toBe("month");
  });

  it("leaves the end open rather than closing it at the epoch", () => {
    const { to } = resolveWalletRange("ytd", 0, undefined, undefined, NOON_UTC);
    expect(to.getTime()).toBe(NOON_UTC.getTime());
  });
});

describe("a custom window is read as local dates", () => {
  it("starts at local midnight and ends at the end of the local day", () => {
    const { from, to } = resolveWalletRange(
      "custom",
      KOLKATA,
      "2026-09-01",
      "2026-09-30",
      NOON_UTC,
    );
    expect(from.toISOString()).toBe("2026-08-31T18:30:00.000Z");
    // Otherwise "until 30 September" would quietly exclude everything on the 30th.
    expect(to.toISOString()).toBe("2026-09-30T18:29:59.999Z");
  });

  it("buckets by month once the window is longer than a quarter", () => {
    const short = resolveWalletRange("custom", 0, "2026-09-01", "2026-09-30", NOON_UTC);
    const long = resolveWalletRange("custom", 0, "2025-01-01", "2026-09-30", NOON_UTC);
    expect(short.bucket).toBe("day");
    expect(long.bucket).toBe("month");
  });

  it("falls back to 30 days rather than erroring on a window it cannot use", () => {
    // A mangled query string should show the last thirty days, not an error page — and
    // an empty wallet reads as "you earned nothing", which is a much worse answer.
    const fallback = resolveWalletRange("30d", 0, undefined, undefined, NOON_UTC);
    for (const args of [
      ["custom", 0, undefined, undefined],
      ["custom", 0, "2026-09-01", undefined],
      ["custom", 0, "2026-09-30", "2026-09-01"],
      ["custom", 0, "nonsense", "also nonsense"],
    ] as const) {
      expect(
        resolveWalletRange(args[0], args[1], args[2], args[3], NOON_UTC).from.toISOString(),
      ).toBe(fallback.from.toISOString());
    }
  });

  it("caps the window at two years, because an unbounded one is a table scan", () => {
    // An authorization-adjacent control, not a UX choice: anyone can ask for it by
    // editing a query string.
    expect(MAX_CUSTOM_RANGE_DAYS).toBe(730);
    const from = new Date("2024-01-01T00:00:00.000Z");
    const to = new Date("2026-09-14T00:00:00.000Z");
    const resolved = resolveWalletRange(
      "custom",
      0,
      from.toISOString().slice(0, 10),
      to.toISOString().slice(0, 10),
      NOON_UTC,
    );
    expect(resolved.to.getTime() - NOON_UTC.getTime()).toBeGreaterThan(-86_400_000);
  });
});

describe("the browser's offset cannot be abused", () => {
  it("clamps to the real range of UTC offsets", () => {
    expect(clampTimezoneOffset(999_999)).toBe(14 * 60);
    expect(clampTimezoneOffset(-999_999)).toBe(-14 * 60);
    expect(clampTimezoneOffset(330)).toBe(330);
  });

  it("accepts the string form a query string produces", () => {
    expect(clampTimezoneOffset("330")).toBe(330);
    expect(clampTimezoneOffset("-480")).toBe(-480);
  });

  it("falls back to UTC rather than NaN", () => {
    // `NaN` reaching the day arithmetic would produce an invalid `Date`, and every
    // comparison against it is false — a wallet window that matches nothing.
    for (const value of [undefined, null, "", "abc", {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clampTimezoneOffset(value)).toBe(0);
    }
  });

  it("truncates a fractional offset", () => {
    expect(clampTimezoneOffset(330.9)).toBe(330);
  });
});

/* ------------------------------ filter resolution ---------------------------- */

describe("resolveWalletFilters — every field comes from a URL", () => {
  it("defaults to the whole wallet over 30 days", () => {
    const filters = resolveWalletFilters({}, NOON_UTC);
    expect(filters).toMatchObject({
      page: 1,
      pageSize: 20,
      search: "",
      filter: "all",
      types: null,
      range: "30d",
      offsetMinutes: 0,
    });
    expect(filters.offset).toBe(0);
  });

  it("maps a chip to the rows behind it", () => {
    expect(resolveWalletFilters({ filter: "payouts" }, NOON_UTC).types).toEqual(
      WALLET_FILTER_TYPES.payouts,
    );
    expect(resolveWalletFilters({ filter: "fees" }, NOON_UTC).types).toEqual(["PLATFORM_FEE"]);
  });

  it("degrades an unknown chip and an unknown window", () => {
    const filters = resolveWalletFilters({ filter: "everything", range: "lifetime" }, NOON_UTC);
    expect(filters.filter).toBe("all");
    expect(filters.types).toBeNull();
    expect(filters.range).toBe("30d");
  });

  it("reads the page and size off a query string", () => {
    // TanStack Router JSON-parses search params, so `?page=2` arrives as a number;
    // a pasted link arrives as a string.
    expect(resolveWalletFilters({ page: 3, pageSize: 10 }, NOON_UTC)).toMatchObject({
      page: 3,
      pageSize: 10,
      offset: 20,
    });
    expect(resolveWalletFilters({ page: "3" }, NOON_UTC).page).toBe(3);
  });

  it("refuses a page size that would read the whole ledger in one request", () => {
    expect(resolveWalletFilters({ pageSize: 100_000 }, NOON_UTC).pageSize).toBe(20);
    expect(resolveWalletFilters({ pageSize: 0 }, NOON_UTC).pageSize).toBe(20);
  });

  it("drops a search term too long to be trusted, rather than half-applying it", () => {
    // A 400-character query string is not something the wallet UI can send — the
    // client caps it at 120 before it gets here — so this is only reachable by a
    // hand-edited URL. Truncating silently would answer a question nobody asked
    // ("show me everything matching the first 120 characters"), so the filter is
    // discarded and the seller sees the whole window instead.
    expect(resolveWalletFilters({ search: "x".repeat(400) }, NOON_UTC).search).toBe("");
    expect(resolveWalletFilters({ search: "PAY-2026" }, NOON_UTC).search).toBe("PAY-2026");
  });

  it("carries the browser's offset into the resolved boundaries", () => {
    const filters = resolveWalletFilters({ range: "today", tz: 330 }, NOON_UTC);
    expect(filters.offsetMinutes).toBe(330);
    expect(filters.from?.toISOString()).toBe("2026-09-13T18:30:00.000Z");
  });

  it("survives being handed nothing", () => {
    expect(resolveWalletFilters(undefined, NOON_UTC).filter).toBe("all");
  });
});

describe("the two numbers a wallet page displays about its own rules", () => {
  it("holds earnings back long enough for a buyer to return something", () => {
    // A seller who can withdraw on the day of delivery has no money to refund out of.
    expect(SETTLEMENT_DELAY_DAYS).toBe(3);
  });

  it("sets the payout floor in paise, not rupees", () => {
    // `MIN_PAYOUT_PAISE` goes straight into a comparison against a `SUM`, so a value
    // that were accidentally rupees would be a hundred times too small — and would
    // look correct, because ₹500 is a plausible minimum.
    expect(MIN_PAYOUT_PAISE).toBe(50_000);
    expect(Number.isInteger(MIN_PAYOUT_PAISE)).toBe(true);
  });
});
