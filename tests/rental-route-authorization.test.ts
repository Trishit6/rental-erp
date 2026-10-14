import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import { rentalsRoute } from "../server/routes/orders";
import { startRouter, type Harness } from "./support/http-harness";
import { stripComments } from "./support/source-scanning";

/**
 * PROMPT R4 — a rental you do not own is a 404, never a 403.
 *
 * ## The parity rule
 *
 * A `403` answers a question the caller was not allowed to ask: it says "this id
 * is real, you just cannot have it", which turns an id-spraying script into an
 * existence oracle over every customer's rentals. The rule the API holds is that a
 * resource scoped away from you is indistinguishable from one that never existed,
 * so every ownership refusal is a `404`.
 *
 * Two independent checks, because the rule has two ways to fail:
 *
 *  - **The gate runs first.** `rentalsRoute.use("*", requireUser)` must answer an
 *    anonymous caller `401` before routing, so a probe cannot enumerate which
 *    rental paths exist either. This boots the real router and asks it, with no
 *    database involved.
 *  - **Ownership is in the predicate.** The refusal is not a check *after* a load;
 *    it is that the load is scoped by `renterId` (or the renter/owner pair), so a
 *    row that is not yours does not come back. This is asserted against the source,
 *    the way `tests/messages-routes.test.ts` asserts its own data-layer rule that
 *    cannot be exercised without a database.
 */

const ROOT = join(__dirname, "..");
const RENTALS_SOURCE = join(ROOT, "server/routes/orders.ts");

const ENDPOINTS: [method: string, path: string][] = [
  ["GET", "/api/rentals/"],
  ["GET", "/api/rentals/7"],
  ["POST", "/api/rentals/7/return-request"],
  ["POST", "/api/rentals/7/extension-request"],
  ["POST", "/api/rentals/7/return"],
  ["POST", "/api/rentals/7/cancel"],
  ["POST", "/api/rentals/7/buy"],
  // Not a real route: the gate runs before matching, so it must also answer 401.
  ["POST", "/api/rentals/7/does-not-exist"],
];

describe("the rentals API refuses anonymous callers before routing", () => {
  let harness: Harness;

  beforeAll(async () => {
    const router = new Router();
    router.onError(onErrorHandler);
    router.use(async (c, next) => {
      c.set(SESSION_USER_KEY, null);
      await next();
    });
    router.route("/api/rentals", rentalsRoute);
    harness = await startRouter(router);
  });

  afterAll(async () => {
    await harness.close();
  });

  for (const [method, path] of ENDPOINTS) {
    it(`${method} ${path} answers 401, not 404`, async () => {
      const response = await harness.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify({}),
      });
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("UNAUTHENTICATED");
    });
  }
});

describe("rental ownership is in the lookup, so a non-owned rental is a 404", () => {
  const source = readFileSync(RENTALS_SOURCE, "utf8");
  const code = stripComments(source);
  // `orders.ts` also declares an `ordersRoute` whose `/:id/cancel` would otherwise be
  // found first. Every rental action lives after the rentals router's own gate, so
  // the section is anchored there rather than at the top of the file.
  const rentalsSection = code.slice(code.indexOf('rentalsRoute.use("*"'));

  /** The source between a route's path literal and the next `rentalsRoute.<verb>`. */
  function handlerBlock(path: string): string {
    const marker = `"${path}"`;
    const start = rentalsSection.indexOf(marker);
    expect(start, `route ${path} is not registered on rentalsRoute`).toBeGreaterThan(-1);
    const next = rentalsSection.indexOf("rentalsRoute.", start + marker.length);
    return next < 0 ? rentalsSection.slice(start) : rentalsSection.slice(start, next);
  }

  it("reads the file it is meant to be checking", () => {
    expect(source).toContain('"/:id/buy"');
    expect(source.length).toBeGreaterThan(5_000);
    expect(code).toContain('rentalsRoute.use("*"');
    expect(rentalsSection.length).toBeGreaterThan(2_000);
  });

  it("never answers 403 anywhere in the router", () => {
    // The whole-rule assertion, stated once: there is no existence-confirming
    // refusal to find, in any rental *or* order handler.
    expect(code).not.toContain("403");
  });

  for (const path of [
    "/:id/return-request",
    "/:id/extension-request",
    "/:id/return",
    "/:id/cancel",
    "/:id/buy",
  ]) {
    it(`${path}: scopes the lookup by ownership and 404s`, () => {
      const block = handlerBlock(path);
      expect(block, `${path} must scope its lookup by ownership`).toMatch(
        /eq\(rentals\.(renterId|ownerId), user\.id\)/,
      );
      expect(block, `${path} must 404 rather than 403`).toContain('HttpError(404, "NOT_FOUND"');
      expect(block).not.toContain("FORBIDDEN");
    });
  }

  it("lets the owner confirm a return by including both parties in the predicate", () => {
    // `/:id/return` is the one shared action: the owner physically receives the
    // item, so both are allowed — and still only a 404 for everyone else.
    const block = handlerBlock("/:id/return");
    expect(block).toMatch(
      /or\(eq\(rentals\.renterId, user\.id\), eq\(rentals\.ownerId, user\.id\)\)/,
    );
  });
});
