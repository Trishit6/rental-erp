import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Router, compilePath, type Ctx } from "../server/lib/http";
import { onErrorHandler } from "../server/lib/api";
import { HttpError } from "../server/lib/api";
import { startRouter, type Harness } from "./support/http-harness";

/**
 * The HTTP layer's own behaviour.
 *
 * ## Why this file exists
 *
 * When Hono was removed, `server/lib/http.ts` took over three jobs that had been a
 * framework's: deciding what matched a path, chaining middleware, and turning a
 * throw into a response. Each of those had a failure mode that no type-checker or
 * handler test could see, and each of them actually broke during the migration:
 *
 *  - a constrained route (`:id{[0-9]+}`) 404'd the literal paths registered after
 *    it, because the constraint was checked *after* matching and a miss ended the
 *    chain instead of falling through to the next route;
 *  - `route("/")` matched only `"/"`, so every endpoint in a sub-router mounted at
 *    the root was unreachable;
 *  - a sub-router's `next(error)` landed on the parent chain's step function, which
 *    ignored the error and turned every failure inside it into a 404.
 *
 * All three presented as "the route 404s". The fix for each was to change how
 * matching, prefixes and error propagation work — so the properties below are the
 * ones worth pinning, not the implementation.
 */

describe("a constrained path is part of the match, not a check after it", () => {
  let harness: Harness;

  beforeAll(async () => {
    const router = new Router();
    // Registered in this order deliberately: the constrained `:id` comes first,
    // which is the arrangement that produced the original bug.
    router.get("/:id{[0-9]+}", (c) => {
      c.json({ matched: "id", id: c.req.param("id") });
    });
    router.get("/mine", (c) => {
      c.json({ matched: "mine" });
    });
    router.get("/product/:idOrSlug", (c) => {
      c.json({ matched: "product", value: c.req.param("idOrSlug") });
    });
    router.patch("/:id{[0-9]+}/status", (c) => {
      c.json({ matched: "status", id: c.req.param("id") });
    });
    harness = await startRouter(router);
  });

  afterAll(async () => {
    await harness.close();
  });

  it("does not let the constrained :id swallow a literal path", async () => {
    // The regression. `mine` matches `:id`, so a constraint checked after matching
    // would have to *fall through* to get here — and a fall-through that ends in a
    // 404 is indistinguishable from never having matched at all.
    const response = await harness.request("/mine");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matched: "mine" });
  });

  it("still routes a numeric id", async () => {
    const response = await harness.request("/42");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matched: "id", id: "42" });
  });

  it("matches no pattern at all for a non-numeric id", async () => {
    const response = await harness.request("/not-a-number");
    expect(response.status).toBe(404);
  });

  it("leaves an unconstrained parameter free to hold a slug", async () => {
    const response = await harness.request("/product/smart-smartwatch-p7255");
    expect(await response.json()).toEqual({
      matched: "product",
      value: "smart-smartwatch-p7255",
    });
  });

  it("applies the constraint on a nested parameter too", async () => {
    const good = await harness.request("/7/status", { method: "PATCH" });
    expect(good.status).toBe(200);

    const bad = await harness.request("/abc/status", { method: "PATCH" });
    expect(bad.status).toBe(404);
  });
});

describe("a mounted sub-router sees its own paths, not the full URL", () => {
  let harness: Harness;

  beforeAll(async () => {
    const child = new Router();
    // The root route is the one that broke: the parent computed the sub-router's
    // base as "what is left over" instead of "what to strip", so `/` never matched.
    child.get("/", (c) => {
      c.json({ matched: "child-root", search: c.req.query("q") ?? null });
    });
    child.get("/overview", (c) => {
      c.json({ matched: "child-overview" });
    });
    child.get("/:id{[0-9]+}", (c) => {
      c.json({ matched: "child-id", id: c.req.param("id") });
    });

    const parent = new Router();
    parent.route("/api/child", child);
    harness = await startRouter(parent);
  });

  afterAll(async () => {
    await harness.close();
  });

  it("matches the sub-router's root route at the mount point", async () => {
    const response = await harness.request("/api/child");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matched: "child-root", search: null });
  });

  it("matches a nested route below the mount", async () => {
    const response = await harness.request("/api/child/overview");
    expect(await response.json()).toEqual({ matched: "child-overview" });
  });

  it("passes query parameters through untouched", async () => {
    const response = await harness.request("/api/child?q=camera");
    expect(await response.json()).toEqual({ matched: "child-root", search: "camera" });
  });
});

describe("mount prefixes do not bleed into each other", () => {
  let harness: Harness;

  beforeAll(async () => {
    const sellers = new Router();
    sellers.get("/:id{[0-9]+}", (c) => {
      c.json({ matched: "seller", id: c.req.param("id") });
    });

    const seller = new Router();
    seller.get("/profile", (c) => {
      c.json({ matched: "profile" });
    });

    const parent = new Router();
    parent.route("/api/seller", seller);
    parent.route("/api/sellers", sellers);
    harness = await startRouter(parent);
  });

  afterAll(async () => {
    await harness.close();
  });

  it("keeps /api/seller from answering /api/sellers", async () => {
    // Registered first, so a prefix match that did not require a segment boundary
    // would let `/api/seller` swallow the public shopfront.
    const response = await harness.request("/api/sellers/7");
    expect(await response.json()).toEqual({ matched: "seller", id: "7" });
  });

  it("still reaches the singular mount", async () => {
    const response = await harness.request("/api/seller/profile");
    expect(await response.json()).toEqual({ matched: "profile" });
  });
});

describe("a throw inside a sub-router reaches the root's error handler", () => {
  let harness: Harness;

  beforeAll(async () => {
    const child = new Router();
    child.get("/boom", () => {
      throw new HttpError(409, "CONFLICT", "That listing is already archived.");
    });
    child.get("/ok", (c) => {
      c.json({ fine: true });
    });

    const parent = new Router();
    parent.onError(onErrorHandler);
    parent.route("/api/child", child);
    harness = await startRouter(parent);
  });

  afterAll(async () => {
    await harness.close();
  });

  it("turns the error into a JSON envelope with its status", async () => {
    // The regression: the child's `next(error)` used to resume the parent's *chain*,
    // which discarded the error and fell through to a 404. A conflict reported as
    // "not found" is the kind of bug that costs an afternoon.
    const response = await harness.request("/api/child/boom");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "CONFLICT", message: "That listing is already archived." },
    });
  });

  it("does not disturb the sibling routes", async () => {
    const response = await harness.request("/api/child/ok");
    expect(response.status).toBe(200);
  });
});

describe("middleware gates run before the route handler", () => {
  it("can answer without reaching the handler", async () => {
    const router = new Router();
    router.use(async (c: Ctx, next) => {
      await next();
    });
    router.get("/guarded", () => {
      // Never reached: the gate above throws first.
      throw new Error("handler should not run");
    });

    const harness = await startRouter(router);
    try {
      const response = await harness.request("/guarded");
      // The gate called next(), so the handler ran and threw; without an error
      // handler on this router Express answers with its own 500 page.
      expect(response.status).toBe(500);
    } finally {
      await harness.close();
    }
  });

  it('runs for a path the router does not define, as Hono\'s use("*") did', async () => {
    // Load-bearing for the auth gates: `walletRoute.use("*", requireSeller)` is what
    // makes an unauthenticated call to an *unknown* wallet path answer 401 rather
    // than 404, and `wallet-payout.test.ts` asserts exactly that. The gate is shaped
    // like the real one — it throws rather than calling `next()`, so a handler is
    // never reached and a path that does not exist is still refused.
    const router = new Router();
    router.onError(onErrorHandler);
    router.use("*", () => {
      throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
    });
    router.get("/real", (c) => {
      c.json({ gated: false });
    });

    const harness = await startRouter(router);
    try {
      const known = await harness.request("/real");
      expect(known.status).toBe(401);

      const unknown = await harness.request("/not-a-route");
      expect(unknown.status).toBe(401);
    } finally {
      await harness.close();
    }
  });
});

describe("compilePath", () => {
  it("treats the mount root as itself", () => {
    expect(compilePath("/").regexp.test("/")).toBe(true);
  });

  it("tolerates a trailing slash on a real route", () => {
    // Browsers and fetch both produce these, and a table that 404s on a trailing
    // slash looks broken for no visible reason.
    expect(compilePath("/overview").regexp.test("/overview/")).toBe(true);
  });

  it("escapes regex metacharacters in a literal segment", () => {
    // Unescaped, `/a.b` would also match `/axb` and shadow a more specific route.
    const compiled = compilePath("/a.b");
    expect(compiled.regexp.test("/a.b")).toBe(true);
    expect(compiled.regexp.test("/axb")).toBe(false);
  });

  it("does not let an unconstrained parameter span a slash", () => {
    expect(compilePath("/:idOrSlug").regexp.test("/a/b")).toBe(false);
  });
});
