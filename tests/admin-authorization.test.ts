import { afterAll, describe, expect, it } from "vitest";
import { onErrorHandler } from "../server/lib/api";
import { SESSION_USER_KEY, type SessionUser } from "../server/lib/auth";
import { Router } from "../server/lib/http";
import { adminRoute } from "../server/routes/admin";
import { startRouter, type Harness } from "./support/http-harness";

/**
 * The admin API's authorization.
 *
 * ## The property under test
 *
 * Hiding the admin UI is not authorization. The client-side `beforeLoad: requireAdmin`
 * guard stops a non-admin from ever seeing the shell, but it is one `if` in code the
 * user controls: typing the URL, or calling the endpoint directly from the console,
 * goes past it entirely. The refusal has to exist on the server or there is no
 * access control at all.
 *
 * So every assertion here is made against the real `adminRoute`, mounted on a real
 * HTTP server, with the session injected the way the app injects it. These are the
 * requests an attacker would make, not the ones the UI makes.
 *
 * ## Why only the refusals are asserted
 *
 * A 401 and a 403 are decided before any handler runs, so these assertions need no
 * database and cannot be satisfied by a row that happens to exist. The authorized
 * path is a different kind of claim — it depends on the schema and the seed — and it
 * is verified against a running server rather than here, so this file stays free of
 * a database dependency and cannot pass or fail for reasons unrelated to access
 * control.
 */

/** Every admin endpoint a request could be aimed at, including one that doesn't exist. */
const ENDPOINTS: [method: string, path: string][] = [
  ["GET", "/admin/stats"],
  ["GET", "/admin/products"],
  ["GET", "/admin/products/facets"],
  ["GET", "/admin/products/1"],
  ["GET", "/admin/products/1/status"],
  ["GET", "/admin/products/not-a-number"],
  ["GET", "/admin/products?sort=id;DROP%20TABLE%20products"],
  ["GET", "/admin/users"],
  ["GET", "/admin/reports"],
  ["PATCH", "/admin/products/1/status"],
  ["DELETE", "/admin/products/1"],
  // Not a real endpoint. The point is that the gate runs *before* routing, so an
  // anonymous caller cannot probe which admin paths exist by watching for a 404.
  ["GET", "/admin/does-not-exist"],
];

function routerAs(role: "ADMIN" | "SELLER" | "USER" | null): Router {
  const router = new Router();
  router.onError(onErrorHandler);
  router.use(async (c, next) => {
    if (role !== null) {
      c.set(SESSION_USER_KEY, {
        id: 42,
        role,
        name: "Test User",
        email: "user@revaro.local",
        verified: true,
        avatarUrl: null,
      } satisfies SessionUser);
    }
    await next();
  });
  router.route("/", adminRoute);
  return router;
}

const harnesses = new Map<string, Promise<Harness>>();

function harnessFor(role: "ADMIN" | "SELLER" | "USER" | null): Promise<Harness> {
  const key = String(role);
  let pending = harnesses.get(key);
  if (!pending) {
    pending = startRouter(routerAs(role));
    harnesses.set(key, pending);
  }
  return pending;
}

afterAll(async () => {
  for (const pending of harnesses.values()) {
    await (await pending).close();
  }
});

describe("the admin API without a session", () => {
  it("refuses every endpoint with 401", async () => {
    const harness = await harnessFor(null);

    for (const [method, path] of ENDPOINTS) {
      const response = await harness.request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify({ status: "PAUSED" }),
      });

      expect(response.status, `${method} ${path} answered ${response.status}`).toBe(401);
    }
  });

  it("refuses before routing, so the surface cannot be mapped", async () => {
    const harness = await harnessFor(null);

    // 401 rather than 404. `adminRoute.use("*")` runs the gate for paths the router
    // does not define, which is what makes this uniform — and it means an anonymous
    // caller learns only that the area is guarded, not which endpoints exist.
    const missing = await harness.request("/admin/does-not-exist");
    expect(missing.status).toBe(401);

    const real = await harness.request("/admin/products");
    expect(real.status).toBe(401);
  });

  it("answers with a message a person can act on and nothing else", async () => {
    const harness = await harnessFor(null);
    const response = await harness.request("/admin/stats");
    const body = await response.json();

    expect(body.error?.message).toBeTruthy();
    // No stack, no file path, no SQL — the error surface is the one place a
    // deployment's internals most reliably leak.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toMatch(/\/server\/|\.ts:\d+|SELECT |INSERT |stack/i);
  });
});

describe("the admin API with a signed-in non-admin", () => {
  for (const role of ["USER", "SELLER"] as const) {
    it(`refuses a ${role} on every endpoint with 403`, async () => {
      const harness = await harnessFor(role);

      for (const [method, path] of ENDPOINTS) {
        const response = await harness.request(path, {
          method,
          headers: { "Content-Type": "application/json" },
          body: method === "GET" ? undefined : JSON.stringify({ status: "PAUSED" }),
        });

        // 403, not 401: the session is real, the role is simply not sufficient.
        // Collapsing the two would tell an attacker which of the two problems to fix.
        expect(response.status, `${method} ${path} as ${role} answered ${response.status}`).toBe(
          403,
        );
      }
    });

    it(`refuses a ${role} before routing`, async () => {
      const harness = await harnessFor(role);

      expect((await harness.request("/admin/does-not-exist")).status).toBe(403);
    });
  }

  it("does not treat a seller as an administrator", async () => {
    const harness = await harnessFor("SELLER");

    // Sellers have their own dashboard and their own endpoints. Being a seller is
    // not a step towards admin, and a check that looked at any elevated role — or
    // substring-matched the role name — would fail here.
    expect((await harness.request("/admin/stats")).status).toBe(403);
  });

  it("does not leak the figures behind a refusal", async () => {
    const harness = await harnessFor("USER");
    const body = await (await harness.request("/admin/stats")).text();

    // A 403 that still returned the product count would be useless.
    expect(body).not.toMatch(/\d/);
  });
});
