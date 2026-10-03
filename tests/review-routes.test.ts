import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Router } from "../server/lib/http";
import { reviewsRoute } from "../server/routes/reviews";
import { startRouter, type Harness } from "./support/http-harness";

/**
 * Route-table shape for the reviews API.
 *
 * ## The bug this exists to prevent
 *
 * `GET /:id` was registered before `GET /mine`, `GET /seller` and
 * `GET /moderation`. A router matches in registration order, so an unconstrained
 * `/:id` captured those three literal segments, `parseReviewId("mine")` failed, and
 * all three answered 404 — while `/reviews/product/:idOrSlug` (registered first) kept
 * working perfectly. Nothing in the handler, the schema or the client betrays it,
 * and every unit test over the pure helpers passed.
 *
 * It was found by a live smoke test against the running API, not by this suite:
 *
 *     GET /api/reviews/product/smart-smartwatch-p7255 -> 200
 *     GET /api/reviews/mine                            -> 404
 *
 * The fix constrains `:id` to digits, which makes the collision impossible rather
 * than merely absent today.
 *
 * ## Why this replays the table with stub handlers
 *
 * The bug is in the *routing table*, not in any handler, so it can be reproduced
 * without a database: the real (method, path) pairs are re-registered on a throwaway
 * router whose handlers just echo the pattern that matched. That keeps the test in
 * the no-DB suite while still exercising the real matcher — the part whose ordering
 * semantics caused the bug — rather than asserting on a list of strings.
 */

const routes = reviewsRoute.routes();

/** A router with the real reviews paths but handlers that cannot touch a database. */
function replayRouter() {
  const replay = new Router();
  for (const route of routes) {
    const handler = (c: { text: (body: string, status?: number) => void }) => {
      c.text(route.path, 200);
    };
    const method = route.method.toLowerCase() as "get" | "post" | "patch" | "delete";
    replay[method](route.path, handler);
  }
  return replay;
}

let harness: Harness;

beforeAll(async () => {
  harness = await startRouter(replayRouter());
});

afterAll(async () => {
  await harness.close();
});

/** The path pattern that handled this request, or null if nothing matched. */
async function match(path: string, method = "GET"): Promise<string | null> {
  const res = await harness.request(path, { method });
  return res.status === 200 ? res.text() : null;
}

describe("the literal collection paths are not swallowed by /:id", () => {
  // The three that answered 404. Each must reach its own handler.
  it("routes /mine to its own handler", async () => {
    expect(await match("/mine")).toBe("/mine");
  });

  it("routes /seller to its own handler", async () => {
    expect(await match("/seller")).toBe("/seller");
  });

  it("routes /moderation to its own handler", async () => {
    expect(await match("/moderation")).toBe("/moderation");
  });

  it("routes the public product list", async () => {
    expect(await match("/product/1")).toBe("/product/:idOrSlug");
  });

  it("still routes a numeric id to the id handler", async () => {
    expect(await match("/42")).toBe("/:id{[0-9]+}");
  });
});

describe("a review id is only ever a number", () => {
  it("does not route a non-numeric id", async () => {
    // With the digit constraint, "not-a-number" matches no pattern at all — which is
    // what stops an arbitrary literal path being read as an id.
    expect(await match("/not-a-number")).toBeNull();
  });

  it("does not route an unrelated literal path", async () => {
    expect(await match("/nonsense")).toBeNull();
  });

  it("keeps the digit constraint on the sub-resources", async () => {
    expect(await match("/abc/helpful", "POST")).toBeNull();
    expect(await match("/abc/reply", "POST")).toBeNull();
    expect(await match("/abc/moderation", "PATCH")).toBeNull();
  });

  it("still routes the sub-resources for a numeric id", async () => {
    expect(await match("/42/helpful", "POST")).toBe("/:id{[0-9]+}/helpful");
    expect(await match("/42/reply", "POST")).toBe("/:id{[0-9]+}/reply");
    expect(await match("/42/moderation", "PATCH")).toBe("/:id{[0-9]+}/moderation");
  });
});

describe("the route table itself", () => {
  it("constrains every :id parameter to digits", () => {
    // The durable assertion. A new `/:id`-shaped route added by copy-paste without
    // the constraint fails here even if its path is not exercised above — an
    // unconstrained `:id` is a latent shadowing bug, not a style preference.
    //
    // `:idOrSlug` is deliberately not matched: the negative lookahead excludes both
    // a following word character and the `{` of a regex constraint.
    const unconstrained = routes
      .filter((route) => /:id(?![A-Za-z{])/.test(route.path))
      .map((route) => `${route.method} ${route.path}`);
    expect(unconstrained).toEqual([]);
  });

  it("still routes the same set of GET paths it is documented to", () => {
    // A rename that silently dropped an endpoint would otherwise only surface in
    // front of a customer, with the client and server quietly out of step.
    const getPaths = routes
      .filter((route) => route.method === "GET")
      .map((route) => route.path)
      .sort();
    expect(getPaths).toEqual(
      ["/product/:idOrSlug", "/mine", "/seller", "/moderation", "/:id{[0-9]+}"].sort(),
    );
  });
});
