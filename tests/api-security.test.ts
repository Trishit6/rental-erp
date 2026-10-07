import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ok } from "../server/lib/api";
import { createApp } from "../server/lib/http";
import {
  SECURITY_HEADERS,
  isOriginAllowed,
  originGuard,
  securityHeaders,
} from "../server/lib/security";

/**
 * The transport-level protections, driven over real HTTP.
 *
 * ## What is actually at stake
 *
 * Two defences sit in front of every endpoint, and neither is visible from a
 * type or a handler test:
 *
 *  - **The origin guard is the server half of the CSRF defence.** Both auth
 *    cookies are `SameSite=Lax`, which the browser enforces — but `Lax` does not
 *    cover every navigation case, so a state-changing request from a foreign
 *    origin has to be refused *here*, before any session work happens. A guard
 *    that quietly stopped running (wrong mount path, mounted after the routes,
 *    applied only to GET) would leave no failing type and no failing handler
 *    test: the app would simply be open to cross-site request forgery.
 *  - **The security headers constrain what a response may become.** They are
 *    inert on JSON today, which is exactly why they are safe to set — and
 *    exactly the property that would silently be lost if the middleware moved
 *    behind the router.
 *
 * The suite therefore boots the same wiring `server/index.ts` uses —
 * `createApp()` → `securityHeaders` → `/api` `originGuard` → routes — rather
 * than calling the handlers directly, because *where* the middleware is mounted
 * is most of what is being tested.
 */

let server: Server;
let base: string;

beforeAll(async () => {
  const { app, router } = createApp();

  // The production order, from server/index.ts: headers on every response
  // (including the refusal below), origin check scoped to the API.
  app.use(securityHeaders);
  app.use("/api", originGuard);

  router.get("/api/thing", (c) => c.json(ok({})));
  router.post("/api/thing", (c) => c.json(ok({ posted: true })));

  app.use(router.toExpress());
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "API route not found." },
    });
  });

  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("every response carries the API's security headers", () => {
  it("sets the whole set on an ordinary answer", async () => {
    const response = await fetch(`${base}/api/thing`);

    expect(response.status).toBe(200);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("sets them on the refusal the origin guard produces too", async () => {
    // Headers first, then the guard — so even the 403 is answered under the same
    // CSP and frame policy as everything else.
    const response = await fetch(`${base}/api/thing`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: "{}",
    });

    expect(response.status).toBe(403);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("keeps the CSP the restrictive API form, not a page policy", async () => {
    const response = await fetch(`${base}/api/thing`);
    const csp = response.headers.get("Content-Security-Policy") ?? "";

    // `default-src 'none'` — this server renders nothing, so the strict form
    // costs nothing and remains correct if an endpoint ever starts serving
    // something renderable.
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("a state-changing request from another origin is refused", () => {
  it("blocks a cross-site POST before it reaches the route", async () => {
    const response = await fetch(`${base}/api/thing`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: "{}",
    });
    const body = (await response.json()) as {
      success: boolean;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN_ORIGIN");
    // The same envelope every other API failure uses, so the client can surface
    // it with the error handling it already has.
    expect(body.error.message).toMatch(/untrusted origin/i);
  });

  it("blocks the same host on a different port", async () => {
    // Ports are part of an origin's trust boundary: something else listening on
    // this machine is not this app.
    const response = await fetch(`${base}/api/thing`, {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:1" },
      body: "{}",
    });

    expect(response.status).toBe(403);
  });

  it("leaves a GET alone even from a foreign origin", async () => {
    // The guard covers state-changing methods only. A GET with a foreign Origin
    // is a link, a prefetch or a renderer — none of which can ride the cookies
    // into a mutation, and blocking them would break ordinary navigation.
    const response = await fetch(`${base}/api/thing`, {
      headers: { Origin: "https://evil.example" },
    });

    expect(response.status).toBe(200);
  });
});

describe("requests that cannot be a cross-site form are allowed", () => {
  it("allows one with no Origin at all", async () => {
    // The browser attaches `Origin` to every state-changing request a page
    // makes, so its absence means the request did not come from a page: this
    // app's own `fetch`, a curl, a server-to-server call. CSRF is the abuse of
    // *ambient* credentials by a page the user happened to visit, and a request
    // with no originating page cannot be that abuse.
    const response = await fetch(`${base}/api/thing`, {
      method: "POST",
      headers: { Origin: "" },
      body: "{}",
    });

    expect(response.status).toBe(200);
  });

  it("allows its own origin", async () => {
    const response = await fetch(`${base}/api/thing`, {
      method: "POST",
      headers: { Origin: base },
      body: "{}",
    });

    expect(response.status).toBe(200);
  });

  it("allows the same host and port behind a different scheme", async () => {
    // The TLS-terminating-proxy shape: Express sees `http://` because the proxy
    // stripped TLS, while the browser sends an `https://` Origin for the very
    // same site. Scheme is ignored, host and port are not — and an Origin's host
    // is chosen by whoever serves the page, so a page on another host still
    // cannot match. `SameSite=Lax` covers the residual http/https case anyway.
    const response = await fetch(`${base}/api/thing`, {
      method: "POST",
      headers: { Origin: base.replace("http://", "https://") },
      body: "{}",
    });

    expect(response.status).toBe(200);
  });

  it("normalises case and a trailing slash before comparing", async () => {
    const response = await fetch(`${base}/api/thing`, {
      method: "POST",
      headers: { Origin: `${base.toUpperCase()}/` },
      body: "{}",
    });

    expect(response.status).toBe(200);
  });

  it("allows an origin configured through APP_URL", async () => {
    // The deployment where the storefront is served from a different host than
    // the API. Set per test and restored, because `allowedOrigins` reads the
    // environment on every request rather than caching it at import.
    const previous = process.env.APP_URL;
    process.env.APP_URL = "https://shop.example";
    try {
      const response = await fetch(`${base}/api/thing`, {
        method: "POST",
        headers: { Origin: "https://shop.example" },
        body: "{}",
      });

      expect(response.status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previous;
    }
  });
});

describe("the origin decision itself", () => {
  it("treats a missing or empty Origin as not cross-site", () => {
    // Documented above as an HTTP observation; asserted here as the rule, so a
    // future "strict by default" change has to answer for it explicitly.
    expect(isOriginAllowed(undefined, new Set())).toBe(true);
    expect(isOriginAllowed("", new Set())).toBe(true);
  });

  it("refuses anything outside the allowlist", () => {
    expect(isOriginAllowed("https://evil.example", new Set(["http://localhost:5173"]))).toBe(false);
    expect(isOriginAllowed("http://localhost:5173", new Set(["http://localhost:5173"]))).toBe(true);
  });
});
