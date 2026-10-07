/**
 * HTTP-level protections that apply to every API response.
 *
 * Two independent mechanisms, deliberately separated because they defend
 * different things:
 *
 *  - **Origin validation** stops a cross-site form or `fetch` from riding the
 *    browser's cookies into a state-changing endpoint (CSRF). It is the server
 *    half; `SameSite=Lax` on both auth cookies is the browser half, and neither
 *    alone is complete — `Lax` does not cover every navigation case, and an
 *    origin check on its own would be defeated by a client that does not send
 *    `Origin`.
 *  - **Security headers** constrain what a response is allowed to *be*. The API
 *    answers JSON, so most of these are inert by construction — which is exactly
 *    why they are safe to set: they cost nothing today and remain correct if an
 *    endpoint ever starts serving something renderable.
 *
 * Nothing here is authentication or authorization. That lives in
 * `lib/auth.ts` / `lib/seller-access.ts` and is decided per request from the
 * session row; these are the properties of the transport around it.
 */

import { fail } from "./api";
import type { Request, RequestHandler, Response } from "express";

/**
 * Headers set on every response the API sends.
 *
 * `Content-Security-Policy` is the restrictive `default-src 'none'` form rather
 * than a policy tuned for a page, because this server does not serve pages — the
 * client is a separate Vite bundle. Applied to a JSON body it changes nothing;
 * applied to anything renderable it refuses to run a single script, which is the
 * correct default for an API and cannot break the storefront.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // Nothing on this API needs a camera, a microphone, a location or a payment
  // endpoint from the *browser's* point of view of the response itself.
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "X-Frame-Options": "DENY",
};

export const securityHeaders: RequestHandler = (_req: Request, res: Response, next) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  next();
};

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

  for (const name of ["APP_URL", "API_URL"] as const) {
    const value = process.env[name];
    if (value) origins.add(normalizeOrigin(value));
  }
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

/**
 * Refuse state-changing requests from foreign origins.
 *
 * Answers with the same `fail(...)` envelope the rest of the API uses, because a
 * blocked request is an API answer like any other and the client already knows
 * how to surface it.
 */
export const originGuard: RequestHandler = (req: Request, res: Response, next) => {
  if (!STATE_CHANGING.has(req.method)) {
    next();
    return;
  }
  const origin = req.get("origin");
  if (isOriginAllowed(origin, allowedOrigins(req))) {
    next();
    return;
  }
  res.status(403).json(fail("FORBIDDEN_ORIGIN", "This request came from an untrusted origin."));
};
