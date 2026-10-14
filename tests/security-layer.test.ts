import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ok, onErrorHandler } from "../server/lib/api";
import { createApp, Router } from "../server/lib/http";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  cors,
  csrfProtection,
  securityHeaders,
} from "../server/lib/security";
import { REQUEST_ID_HEADER, requestId } from "../server/lib/request-id";
import { InMemoryCounterStore, rateLimit, useRateLimitStore } from "../server/lib/rate-limit";
import {
  isSensitiveKey,
  logger,
  mayLogBody,
  redact,
  redactError,
  redactHeaders,
  redactString,
  redactUrl,
} from "../server/lib/logger";

/**
 * The transport layer's other half.
 *
 * `api-security.test.ts` covers the security headers and the origin guard. This
 * file covers the three protections that share the same mount and the logger that
 * sits behind all of them:
 *
 *  - **CORS** decides which foreign origins may *read* a response. The cases that
 *    matter are the ones a naive implementation gets wrong: the preflight (which
 *    must be answered before routing), the foreign origin (which must get *no*
 *    allow headers, never a reflection) and the request-header allowlist.
 *  - **CSRF** is the double-submit token. The interesting cases are the ones that
 *    distinguish "checked" from "checked correctly": a mutation *with* the auth
 *    cookie and no token is refused, a matching token is accepted, a signed-out
 *    mutation is untouched, and a GET is never treated as a state change.
 *  - **Rate limiting** is a budget, per IP and per account. A limiter that only
 *    ever counts and never refuses is not a limiter, so the test drives a real
 *    budget past its ceiling and asserts `429` + `Retry-After`.
 *
 * The redaction suite is unit-level: `logger`'s helpers are pure, and capturing
 * `console` would test the console, not the redaction.
 */

type Harness = {
  base: string;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
};

/** Boot an app with the same middleware order `server/index.ts` uses. */
async function boot(configure: (router: Router) => void): Promise<Harness> {
  const { app, router } = createApp();
  app.use(securityHeaders);
  app.use(requestId);
  app.use(cors);
  app.use("/api", csrfProtection);
  configure(router);
  app.use(router.toExpress());
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "API route not found." },
    });
  });

  const server: Server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    request: (path, init) => fetch(`${base}${path}`, init),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** Every `Set-Cookie` on a response, Node's `getSetCookie` or a single-header fallback. */
function setCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

describe("CORS answers preflight before routing and never reflects a foreign origin", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await boot((router) => {
      router.get("/api/ping", (c) => c.json(ok({ pong: true })));
      router.post("/api/ping", (c) => c.json(ok({ posted: true })));
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it("answers a preflight for an allowlisted origin with the allow headers", async () => {
    const response = await harness.request("/api/ping", {
      method: "OPTIONS",
      headers: {
        Origin: harness.base,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-csrf-token",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(harness.base);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
      "x-csrf-token",
    );
    // Origins differ, so a shared cache must not reuse an answer across them.
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("answers a foreign preflight with no allow headers at all", async () => {
    const response = await harness.request("/api/ping", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    });

    // Ended here rather than routed — and with nothing the browser could accept.
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("only echoes requested headers that are on the allowlist", async () => {
    const response = await harness.request("/api/ping", {
      method: "OPTIONS",
      headers: {
        Origin: harness.base,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-evil-header",
      },
    });

    const allowed = response.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
    expect(allowed).toContain("content-type");
    expect(allowed).not.toContain("x-evil-header");
  });

  it("echoes an allowlisted origin on a simple read and sets credentials", async () => {
    const response = await harness.request("/api/ping", { headers: { Origin: harness.base } });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(harness.base);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("does not reflect a foreign origin on a simple read", async () => {
    const response = await harness.request("/api/ping", {
      headers: { Origin: "https://evil.example" },
    });

    // The body is still sent; without an allow-origin the browser refuses to hand
    // it to the page. `*` would have made it readable.
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("leaves a non-preflight OPTIONS to normal routing", async () => {
    const response = await harness.request("/api/ping", { method: "OPTIONS" });
    // The CORS middleware only ends a request that carries
    // `Access-Control-Request-Method`; this one falls through to the 404.
    expect(response.status).toBe(404);
  });
});

describe("CSRF: double-submit token, checked only where it can be abused", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await boot((router) => {
      router.get("/api/thing", (c) => c.json(ok({ read: true })));
      router.post("/api/thing", (c) => c.json(ok({ written: true })));
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  async function issuedToken(): Promise<string> {
    const response = await harness.request("/api/thing");
    const token = response.headers.get(CSRF_HEADER);
    expect(token, "the middleware echoes the double-submit token").toMatch(
      /^[A-Za-z0-9_-]{32,64}$/,
    );
    return token as string;
  }

  it("mints a token cookie and echoes the value in a response header", async () => {
    const response = await harness.request("/api/thing");
    const cookie = setCookies(response).find((value) => value.startsWith(`${CSRF_COOKIE}=`));

    expect(cookie, "a fresh request is given the CSRF cookie").toBeTruthy();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(response.headers.get(CSRF_HEADER)).toMatch(/^[A-Za-z0-9_-]{32,64}$/);
  });

  it("refuses a mutation that carries an auth cookie but no token", async () => {
    const response = await harness.request("/api/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "revaro_access_token=stolen" },
      body: "{}",
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("accepts a mutation whose header echoes the cookie", async () => {
    const token = await issuedToken();
    const response = await harness.request("/api/thing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${CSRF_COOKIE}=${token}; revaro_access_token=stolen`,
        [CSRF_HEADER]: token,
      },
      body: "{}",
    });

    expect(response.status).toBe(200);
  });

  it("refuses a header that does not match the cookie", async () => {
    const response = await harness.request("/api/thing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${CSRF_COOKIE}=${"a".repeat(43)}; revaro_access_token=stolen`,
        [CSRF_HEADER]: "b".repeat(43),
      },
      body: "{}",
    });

    expect(response.status).toBe(403);
  });

  it("refuses a token of the wrong shape even when header and cookie agree", async () => {
    const response = await harness.request("/api/thing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${CSRF_COOKIE}=short; revaro_access_token=stolen`,
        [CSRF_HEADER]: "short",
      },
      body: "{}",
    });

    expect(response.status).toBe(403);
  });

  it("does not require a token for a signed-out mutation", async () => {
    // No auth cookie means no ambient credential to forge; the origin guard is the
    // defence for sign-in itself, not this token.
    const response = await harness.request("/api/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(200);
  });

  it("never treats a GET as a state change", async () => {
    const response = await harness.request("/api/thing", {
      headers: { Cookie: "revaro_access_token=stolen" },
    });

    expect(response.status).toBe(200);
  });
});

describe("rate limiting refuses a budget that is exhausted", () => {
  beforeEach(() => {
    // A fresh window per test; the real store is process-wide.
    useRateLimitStore(new InMemoryCounterStore());
  });

  function bootLogin(): Promise<Harness> {
    return boot((router) => {
      router.use(rateLimit("auth.login"));
      router.post("/api/login", (c) => c.json(ok({ signedIn: true })));
    });
  }

  it("answers 429 with Retry-After once the per-IP budget is spent", async () => {
    const harness = await bootLogin();
    try {
      const attempt = (email: string) =>
        harness.request("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.0.0.1" },
          body: JSON.stringify({ email }),
        });

      // `auth.login` allows 10 per minute per address.
      for (let i = 0; i < 10; i++) {
        expect((await attempt(`user${i}@example.com`)).status).toBe(200);
      }

      const blocked = await attempt("user11@example.com");
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
      const body = (await blocked.json()) as { error: { code: string } };
      expect(body.error.code).toBe("RATE_LIMITED");
    } finally {
      await harness.close();
    }
  });

  it("follows the account across addresses, not just the socket", async () => {
    const harness = await bootLogin();
    try {
      const struggle = (ip: string) =>
        harness.request("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
          body: JSON.stringify({ email: "victim@example.com" }),
        });

      // Ten distinct addresses, one account: the per-IP buckets each hold one hit,
      // so only the per-account bucket can stop the eleventh.
      for (let i = 0; i < 10; i++) {
        expect((await struggle(`10.1.0.${i}`)).status).toBe(200);
      }

      expect((await struggle("10.1.9.9")).status).toBe(429);
    } finally {
      await harness.close();
    }
  });
});

describe("every response is correlatable and every failure has one shape", () => {
  it("stamps a fresh request with an id", async () => {
    const harness = await boot((router) => {
      router.get("/api/ping", (c) => c.json(ok({ pong: true })));
    });
    try {
      const response = await harness.request("/api/ping");
      expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[A-Za-z0-9-]{8,}$/);
    } finally {
      await harness.close();
    }
  });

  it("adopts a well-formed inbound id and ignores a malformed one", async () => {
    const harness = await boot((router) => {
      router.get("/api/ping", (c) => c.json(ok({ pong: true })));
    });
    try {
      const adopted = await harness.request("/api/ping", {
        headers: { [REQUEST_ID_HEADER]: "trace-12345678" },
      });
      expect(adopted.headers.get(REQUEST_ID_HEADER)).toBe("trace-12345678");

      const rejected = await harness.request("/api/ping", {
        headers: { [REQUEST_ID_HEADER]: "bad id!" },
      });
      expect(rejected.headers.get(REQUEST_ID_HEADER)).not.toBe("bad id!");
    } finally {
      await harness.close();
    }
  });

  it("turns an unhandled error into the one envelope, with no stack or SQL", async () => {
    // The error handler logs; silence it so the suite's output stays readable.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const harness = await boot((router) => {
      router.onError(onErrorHandler);
      router.get("/api/boom", () => {
        throw new Error("SELECT password FROM users -- at handler routes.ts:1");
      });
    });
    try {
      const response = await harness.request("/api/boom");
      expect(response.status).toBe(500);
      const body = (await response.json()) as {
        success: boolean;
        error: { code: string; message: string };
      };
      expect(body).toEqual({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
      });
      expect(JSON.stringify(body)).not.toMatch(/SELECT|password|routes\.ts|at handler/);
    } finally {
      await harness.close();
      spy.mockRestore();
    }
  });
});

describe("the logger never writes a secret", () => {
  it("redacts values under sensitive keys, however they nest", () => {
    const output = redact({
      email: "shopper@example.com",
      password: "hunter2",
      nested: { token: "abc", authorization: "Bearer x" },
    }) as Record<string, unknown>;

    expect(output.email).toBe("shopper@example.com");
    expect(output.password).toBe("[redacted]");
    expect(output.nested).toEqual({ token: "[redacted]", authorization: "[redacted]" });
  });

  it("recognises header names regardless of case and punctuation", () => {
    expect(isSensitiveKey("Authorization")).toBe(true);
    expect(isSensitiveKey("set-cookie")).toBe(true);
    expect(isSensitiveKey("X-CSRF-Token")).toBe(true);
    expect(isSensitiveKey("Content-Type")).toBe(false);
  });

  it("redacts token shapes inside free text, not just under a key", () => {
    expect(redactString("Authorization: Bearer abc.def.ghi")).toContain("Bearer [redacted]");
    expect(redactString("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123")).toBe("[redacted-jwt]");
    expect(redactString("a".repeat(40))).toBe("[redacted-secret]");
  });

  it("redacts an OTP held in a code field but leaves an enum code alone", () => {
    expect((redact({ code: "123456" }) as Record<string, unknown>).code).toBe("[redacted]");
    expect((redact({ code: "OK" }) as Record<string, unknown>).code).toBe("OK");
  });

  it("redacts secret query parameters but keeps the path", () => {
    const redacted = redactUrl("/api/reset?token=abc123&email=shopper%40example.com");
    expect(redacted.startsWith("/api/reset?")).toBe(true);
    expect(redacted).not.toContain("abc123");
    expect(redacted).toContain("email=shopper%40example.com");
    expect(redactUrl("/api/products")).toBe("/api/products");
  });

  it("redacts secret response headers", () => {
    const headers = redactHeaders({
      Authorization: "Bearer secret-token",
      Cookie: "revaro_access_token=abc",
      "X-CSRF-Token": "tok",
      "Content-Type": "application/json",
    });

    expect(headers.Authorization).toBe("[redacted]");
    expect(headers.Cookie).toBe("[redacted]");
    expect(headers["X-CSRF-Token"]).toBe("[redacted]");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("survives a self-referential object", () => {
    const value: Record<string, unknown> = { safe: true };
    value.self = value;
    expect((redact(value) as Record<string, unknown>).self).toBe("[circular]");
  });

  it("keeps auth, payment, wallet and upload bodies out of the log", () => {
    expect(mayLogBody("/api/auth/login")).toBe(false);
    expect(mayLogBody("/api/payments/intents")).toBe(false);
    expect(mayLogBody("/api/seller/wallet/payouts")).toBe(false);
    expect(mayLogBody("/api/storage/upload")).toBe(false);
    expect(mayLogBody("/api/products/search")).toBe(true);
  });

  it("writes a redacted line when handed a sensitive context", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      logger.info("sign-in failed", {
        password: "hunter2",
        cookie: "revaro_access_token=abc",
        nested: { token: "sensitive-token-value" },
      });
      const line = String(spy.mock.calls.at(-1)?.[0] ?? "");
      expect(line).toContain("[redacted]");
      expect(line).not.toContain("hunter2");
      expect(line).not.toContain("sensitive-token-value");
    } finally {
      spy.mockRestore();
    }
  });

  it("redacts the credential in a connection string but keeps the account and host", () => {
    // A `DATABASE_URL` is the one string that is *both* a secret and a value a
    // driver quotes back in its own error text. The password goes; the account and
    // host stay, because "revaro_app failed against db.internal" is the diagnostic.
    const line = redactString("connect failed: mysql://revaro_app:sup3r-secret@db.internal/reloop");
    expect(line).toContain("mysql://revaro_app:[redacted]@db.internal/reloop");
    expect(line).not.toContain("sup3r-secret");
    // A URL with no userinfo is not touched.
    expect(redactString("https://cdn.example.com/img.png")).toBe("https://cdn.example.com/img.png");
  });

  it("reduces a thrown error to a redacted name, message and enum code", () => {
    // The whole reason `redactError` exists rather than `logger.error(msg, error)`:
    // the message can quote a connection string or a reset token, and the stack can
    // name a file and a line nobody outside the process should read.
    const error = new Error(
      "connect failed for mysql://revaro_app:sup3r-secret@db.internal:3306/reloop — " +
        "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123",
    );
    (error as Error & { code?: string }).code = "ER_ACCESS_DENIED_ERROR";

    const redacted = redactError(error);

    expect(redacted.name).toBe("Error");
    expect(redacted.code).toBe("ER_ACCESS_DENIED_ERROR");
    expect(redacted.message).toContain("mysql://revaro_app:[redacted]@db.internal");
    expect(redacted.message).toContain("[redacted-jwt]");
    expect(JSON.stringify(redacted)).not.toMatch(/sup3r-secret|eyJhbGci/);
  });

  it("drops the stack and stringifies a non-error, still redacting it", () => {
    expect(redactError({ stack: "at secret.ts:1" })).toEqual({
      name: "Error",
      message: "[object Object]",
    });
    expect(redactError("boom Bearer abc.def.ghi")).toEqual({
      name: "Error",
      message: "boom Bearer [redacted]",
    });
  });
});
