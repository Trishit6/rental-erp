/**
 * HTTP-level protections that apply to every API response.
 *
 * All the transport defences live in one place because they defend the same thing
 * — the boundary between a browser and the API — and because *where* they are
 * mounted is most of what makes them work:
 *
 *  - **Security headers** constrain what a response is allowed to *be*. The API
 *    answers JSON, so most of these are inert by construction — which is exactly
 *    why they are safe to set: they cost nothing today and remain correct if an
 *    endpoint ever starts serving something renderable.
 *  - **Origin validation** stops a cross-site form or `fetch` from riding the
 *    browser's cookies into a state-changing endpoint. It is the server half;
 *    `SameSite=Lax` on the auth cookies is the browser half, and neither alone is
 *    complete.
 *  - **CORS** decides which foreign origins may *read* responses, and only those
 *    origins may: never `*`, never credentials with `*`, never a blind echo.
 *  - **CSRF (double-submit)** — a per-session random token in a cookie that every
 *    mutation must echo back in a custom header. The cookie is the server's only
 *    authority; the value is also returned in a response header so Revaro's own
 *    client can echo it without ever reading `document.cookie` (a deliberate
 *    property of this codebase — see `client-token-hygiene.test.ts`), and a
 *    cross-site attacker can neither read the response header (same-origin
 *    policy) nor forge the token knowing only the cookie.
 *
 * Nothing here is authentication or authorization. That lives in `lib/auth.ts` /
 * `lib/permissions.ts` and is decided per request from the session row; these are
 * the properties of the transport around it.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { fail } from "./api";
import { appendSetCookie, parseCookies } from "./http";
import { appBaseUrl, isProduction } from "./env";
import type { Request, RequestHandler, Response } from "express";

/* ------------------------------ security headers ---------------------------- */

/**
 * Headers set on every response the API sends.
 *
 * The CSP is the `default-src 'none'` form with explicit `img-src` / `connect-src`
 * sources rather than a tuned page policy: this server renders nothing — it answers
 * JSON and the client is a separate Vite bundle — so every fetch directive may be
 * denied by default, which costs nothing today and remains correct if an endpoint
 * ever starts serving something renderable. The explicit `img-src`/`connect-src`
 * keep the *deployment shape* honest (images may come from `data:`/`blob:` and
 * external `https:`, the client talks to this same origin); framing, `base-uri`
 * targeting and plugin content are refused outright.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; " +
    // BEGIN RAZORPAY HOSTED CHECKOUT (remove if no longer using Razorpay)
    "script-src 'self' https://checkout.razorpay.com; frame-src https://checkout.razorpay.com https://api.razorpay.com; " +
    // END RAZORPAY HOSTED CHECKOUT
    "object-src 'none'; img-src 'self' data: blob: https:; connect-src 'self' https:",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // Nothing on this API needs a camera, a microphone, a location or a payment
  // endpoint from the *browser's* point of view of the response itself.
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "X-Frame-Options": "DENY",
};

export const securityHeaders: RequestHandler = (_req: Request, res: Response, next) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  // Express identifies itself by default; Revaro's API does not advertise its
  // stack. `app.disable("x-powered-by")` covers the default path, this covers a
  // response produced before that ran or by a layer that re-enabled it.
  res.removeHeader("X-Powered-By");
  next();
};

/* ---------------------------------- origins --------------------------------- */

/** Methods whose side effects are worth defending — the ones CSRF applies to. */
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Build the set of origins this deployment considers "its own".
 *
 * Two sources: the URL the request itself arrived on (which covers the dev proxy
 * and any same-origin deployment without configuration), and the explicitly
 * configured origins — `APP_URL`/`API_URL` from `.env`, plus a comma-separated
 * `AUTH_ALLOWED_ORIGINS` for the case where the client is served from a
 * different host than the API.
 *
 * There is deliberately no wildcard path. `Access-Control-Allow-Origin: *` with
 * credentialed requests is refused by browsers precisely *because* it would mean
 * "any site may read this", and an origin allowlist that could be widened to
 * `*` by a typo is not an allowlist.
 */
export function allowedOrigins(req: Request): Set<string> {
  const origins = new Set<string>();
  const self = `${req.protocol}://${req.get("host") ?? ""}`;
  if (self !== "http://") origins.add(normalizeOrigin(self));

  for (const name of ["API_URL"] as const) {
    const value = process.env[name];
    if (value) origins.add(normalizeOrigin(value));
  }
  // `APP_URL` (or its deprecated `APP_BASE_URL` fallback) is the client origin.
  const base = appBaseUrl();
  if (base) origins.add(normalizeOrigin(base));
  for (const value of (process.env.AUTH_ALLOWED_ORIGINS ?? "").split(",")) {
    if (value.trim()) origins.add(normalizeOrigin(value));
  }
  return origins;
}

/**
 * Is this `Origin` one of ours?
 *
 * Comparison happens on two levels, and the second exists for one real
 * deployment shape:
 *
 *  1. **Exact** — scheme, host and port all match a configured origin.
 *  2. **Host+port** — the scheme is ignored. A TLS-terminating proxy (or the
 *     Vite dev proxy) leaves Express seeing `http://` while the browser sends an
 *     `https://` Origin for the very same site, and an exact-only rule would
 *     refuse every sign-in, cart add and checkout from behind it. Ignoring the
 *     *scheme* while still requiring host and port cannot widen the set to an
 *     attacker: an Origin's host is chosen by whoever serves the page, so a page
 *     on another host never matches — and a scheme-differing page on the same
 *     host is not something an attacker can host. `SameSite=Lax` covers that
 *     residual case anyway, since http/https are different sites for cookies too.
 *
 * A request with **no** `Origin` is allowed, and that is not a hole: browsers
 * attach `Origin` to every state-changing request a page makes, so its absence
 * means the request did not come from a page — this app's own `fetch`, a
 * server-to-server call, a curl. CSRF is the abuse of *ambient* credentials by a
 * page the user happened to visit; a request with no originating page cannot be
 * that abuse.
 */
export function isOriginAllowed(origin: string | undefined, allowed: ReadonlySet<string>): boolean {
  if (origin === undefined || origin === "") return true;
  const normalized = normalizeOrigin(origin);
  if (allowed.has(normalized)) return true;

  const bare = stripScheme(normalized);
  for (const candidate of allowed) {
    if (stripScheme(candidate) === bare) return true;
  }
  return false;
}

function stripScheme(origin: string): string {
  return origin.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
}

/** The origin of the `Referer` header, if one is present and parseable. */
function refererOrigin(req: Request): string | undefined {
  const referer = req.get("referer");
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Refuse state-changing requests from foreign origins.
 *
 * The primary signal is the `Origin` header. When it is absent (the header is a
 * deliberate explainer on *state-changing* requests, so most browsers do send it)
 * the `Referer` is consulted as a fallback — still a cross-site guard, because
 * `Referer` is something the origin page itself controls — and a request with
 * either signal pointing at another origin is refused. A request carrying
 * *neither* header cannot have come from a page at all and proceeds.
 *
 * Answers with the same `fail(...)` envelope the rest of the API uses, because a
 * blocked request is an API answer like any other.
 */
export const originGuard: RequestHandler = (req: Request, res: Response, next) => {
  if (!STATE_CHANGING.has(req.method)) {
    next();
    return;
  }
  const allowed = allowedOrigins(req);
  const origin = req.get("origin");
  if (origin !== undefined && origin !== "") {
    if (isOriginAllowed(origin, allowed)) {
      next();
      return;
    }
  } else {
    // No Origin: fall back to Referer. `isOriginAllowed(undefined)` is true by
    // contract, so the two cases are checked explicitly here rather than reused.
    const from = refererOrigin(req);
    if (from === undefined || isOriginAllowed(from, allowed)) {
      next();
      return;
    }
  }
  res.status(403).json(fail("FORBIDDEN_ORIGIN", "This request came from an untrusted origin."));
};

/* ------------------------------------ cors ---------------------------------- */

/** Response headers a preflight may ask for that are useful to this API. */
const REFLECTABLE_HEADERS = new Set(["content-type", "x-csrf-token", "x-requested-with", "accept"]);

function appendVary(res: Response, value: string): void {
  const existing = res.getHeader("Vary");
  const values = new Set(
    typeof existing === "string"
      ? existing.split(",").map((v) => v.trim()).filter(Boolean)
      : Array.isArray(existing)
        ? existing.map((v) => String(v).trim()).filter(Boolean)
        : [],
  );
  values.add(value);
  res.setHeader("Vary", [...values].join(", "));
}

function reflectRequestedHeaders(req: Request): string {
  const requested = req.get("access-control-request-headers");
  if (!requested) return "Content-Type, X-CSRF-Token";
  const kept = requested
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => REFLECTABLE_HEADERS.has(h));
  return kept.length > 0 ? kept.join(", ") : "Content-Type";
}

/**
 * CORS for the allowlisted origins.
 *
 * Rules that keep the browser honest, all enforced here rather than assumed:
 *
 *  - **Never `*` with credentials.** The `Access-Control-Allow-Origin` header
 *    echoes the request's origin *only after* that origin has passed the same
 *    allowlist the origin guard uses, and `Access-Control-Allow-Credentials:
 *    true` is set only in that case.
 *  - **Never a blind reflection.** A foreign origin gets no CORS headers at all,
 *    so the browser refuses its reads — the response body is still sent, but the
 *    page cannot see it.
 *  - **Preflight is a distinct beast.** An `OPTIONS` with an
 *    `Access-Control-Request-Method` header is answered and ended here, before
 *    any route or CSRF work: it carries no cookies by design, and answering it
 *    with the *allowed* methods/headers tells the browser exactly what it may do.
 *    Non-preflight `OPTIONS` falls through to normal routing.
 */
export const cors: RequestHandler = (req: Request, res: Response, next) => {
  // Cache safety: a single cached response can only ever serve a single origin.
  appendVary(res, "Origin");

  const origin = req.get("origin");
  const allowed = origin !== undefined && origin !== "" && isOriginAllowed(origin, allowedOrigins(req));
  const isPreflight = req.method === "OPTIONS" && !!req.get("access-control-request-method");

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin!);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (isPreflight) {
    if (allowed) {
      res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", reflectRequestedHeaders(req));
      res.setHeader("Access-Control-Max-Age", "600");
    }
    // A disallowed preflight also ends here — with no allow headers, so the
    // browser refuses the cross-origin read — rather than reaching a handler.
    res.status(204).end();
    return;
  }

  next();
};

/* ------------------------------------ csrf ---------------------------------- */

/** Cookie names the transport layer keys off. Mirrors `lib/auth.ts`; see below. */
const AUTH_COOKIE_NAMES = ["revaro_access_token", "revaro_refresh_token"] as const;

/**
 * The double-submit token cookie and the header that must echo it.
 *
 * The cookie name is duplicated (not imported) from `lib/auth.ts` on purpose:
 * importing auth into the transport layer would pull the session/database module
 * into every importer of this file — including tests that only want the headers.
 * `client-token-hygiene.test.ts` anchors the auth names by reading `auth.ts`
 * itself, so a rename there cannot silently drift from these literals.
 */
export const CSRF_COOKIE = "revaro_csrf";
export const CSRF_HEADER = "X-CSRF-Token";

/** A token the middleware will accept back: 32 bytes of base64url. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/;
const CSRF_TTL_SECONDS = 7 * 24 * 60 * 60;

function cookieSecure(): boolean {
  return isProduction() || process.env.AUTH_COOKIE_SECURE === "true";
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function hasAuthCookie(req: Request): boolean {
  const jar = parseCookies(req.get("cookie"));
  return AUTH_COOKIE_NAMES.some((name) => jar[name] !== undefined);
}

/**
 * CSRF: issue the double-submit token and enforce its echo.
 *
 * On **every** `/api` request: if the `revaro_csrf` cookie is absent or malformed
 * a fresh random token is set (HttpOnly, `SameSite=Lax`), and the current token
 * is echoed in the `X-CSRF-Token` **response** header. Echoing in a header rather
 * than via `document.cookie` is a deliberate accommodation: this codebase's rule
 * is that client JavaScript never reads the cookie jar, and the response header is
 * every bit as unreadable to a cross-site attacker (same-origin policy), so
 * nothing is lost.
 *
 * On a **state-changing** request that carries an auth cookie: the `X-CSRF-Token`
 * request header must equal the cookie value, compared in constant time. A request
 * with no auth cookie has no ambient credential to forge and is not checked — a
 * signed-out login attempt is defended by the origin guard, not by this token.
 */
export const csrfProtection: RequestHandler = (req: Request, res: Response, next) => {
  const jar = parseCookies(req.get("cookie"));
  const existing = jar[CSRF_COOKIE];
  let token = existing && TOKEN_SHAPE.test(existing) ? existing : "";

  if (!token) {
    token = randomBytes(32).toString("base64url");
    appendSetCookie(res, CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      secure: cookieSecure(),
      maxAge: CSRF_TTL_SECONDS * 1000,
    });
  }
  res.setHeader(CSRF_HEADER, token);

  if (STATE_CHANGING.has(req.method) && hasAuthCookie(req)) {
    const provided = req.get(CSRF_HEADER);
    if (!provided || !TOKEN_SHAPE.test(provided) || !safeEqual(provided, token)) {
      res.status(403).json(
        fail("CSRF_TOKEN_INVALID", "This request needs a valid security token. Please refresh and try again."),
      );
      return;
    }
  }

  next();
};