import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The browser half of the double-submit CSRF defence.
 *
 * The server (`lib/security.ts`) refuses a mutation that carries an auth cookie
 * but no matching `X-CSRF-Token`; this module is what supplies that header. The
 * failure mode if it stops is silent and total — every signed-in write starts
 * answering 403 — and no component test would see it, because those mock this
 * client wholesale. So the transport itself is driven against a stub `fetch`.
 *
 * No test here asserts on a token's *value* reaching storage or a URL: the token
 * lives in a module variable for the life of the page and travels only in a
 * request header, which is the property being protected.
 */

function envelope(
  body: unknown,
  init: { status?: number; csrf?: string } = {},
): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.csrf) headers["X-CSRF-Token"] = init.csrf;
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

const ok = (data: unknown, csrf?: string) => envelope({ success: true, data }, { csrf });
const fail = (code: string, status: number, csrf?: string) =>
  envelope({ success: false, error: { code, message: "nope" } }, { status, csrf });

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

/** A fresh module so each test starts with no remembered token or refresh latch. */
async function freshClient() {
  vi.resetModules();
  return import("@/lib/api/client");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the API client sends the CSRF token", () => {
  it("leaves a read alone, remembers the token it carried, and echoes it on the next write", async () => {
    const fetchMock = vi.fn(async () => ok({ items: [] }, "token-one"));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await freshClient();

    await api.get("/products");
    const [readUrl, readInit] = fetchMock.mock.calls[0]!;
    expect(readUrl).toBe("/api/products");
    expect((readInit as RequestInit).credentials).toBe("include");
    expect(headerOf(readInit as RequestInit, "X-CSRF-Token")).toBeNull();

    await api.post("/cart/items", { productId: 1 });
    const writeInit = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(headerOf(writeInit, "X-CSRF-Token")).toBe("token-one");
    expect(headerOf(writeInit, "Content-Type")).toBe("application/json");
  });

  it("primes GET /api/auth/csrf before a mutation with no token yet", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/auth/csrf") return ok({ csrf: true }, "primed-token");
      return ok({ id: 7 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await freshClient();

    await api.post("/favorites", { productId: 3 });

    expect(String(fetchMock.mock.calls[0]![0])).toBe("/api/auth/csrf");
    expect(String(fetchMock.mock.calls[1]![0])).toBe("/api/favorites");
    expect(headerOf(fetchMock.mock.calls[1]![1] as RequestInit, "X-CSRF-Token")).toBe(
      "primed-token",
    );
  });

  it("primes once for a burst of concurrent writes", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/auth/csrf") return ok({ csrf: true }, "shared-token");
      return ok({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await freshClient();

    await Promise.all([api.post("/favorites", { productId: 1 }), api.post("/cart/items", { productId: 2 })]);

    const primes = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/auth/csrf");
    expect(primes).toHaveLength(1);
    for (const call of fetchMock.mock.calls) {
      if (String(call[0]) === "/api/auth/csrf") continue;
      expect(headerOf(call[1] as RequestInit, "X-CSRF-Token")).toBe("shared-token");
    }
  });

  it("carries the token on the refresh request and retries the original once", async () => {
    let reads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/orders") {
        reads += 1;
        return reads === 1
          ? fail("UNAUTHENTICATED", 401, "round-trip-token")
          : ok({ items: [] }, "round-trip-token");
      }
      if (url === "/api/auth/refresh") return ok({ refreshed: true }, "round-trip-token");
      return ok({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await freshClient();

    const result = await api.get<{ items: unknown[] }>("/orders");

    expect(result.data.items).toEqual([]);
    expect(reads).toBe(2);

    const refresh = fetchMock.mock.calls.find(([url]) => String(url) === "/api/auth/refresh");
    expect(refresh, "an expired session is refreshed, not surfaced as an error").toBeTruthy();
    expect(headerOf(refresh![1] as RequestInit, "X-CSRF-Token")).toBe("round-trip-token");
    expect(headerOf(refresh![1] as RequestInit, "Content-Type")).toBe("application/json");
  });

  it("continues to surface the API's error shape after the transport work", async () => {
    const fetchMock = vi.fn(async () => fail("FORBIDDEN", 403));
    vi.stubGlobal("fetch", fetchMock);
    const { api, ApiError } = await freshClient();

    await expect(api.delete("/cart/items/1")).rejects.toBeInstanceOf(ApiError);
    await expect(api.delete("/cart/items/2")).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
