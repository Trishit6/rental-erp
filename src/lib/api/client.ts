export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  pagination?: Pagination;
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/* ------------------------------- session refresh --------------------------- */

/**
 * The one in-flight refresh, shared by everything that asked.
 *
 * ## Why this exists as a promise rather than a flag
 *
 * When the access token expires, it expires for *every* request in flight at
 * that moment — a page's cart, its unread badge and its user query all receive a
 * 401 within a few milliseconds of each other. Without a shared promise each
 * would start its own refresh, and since every successful refresh rotates the
 * refresh token, the second and third requests would present a token that has
 * already been spent: the server would read that as a replay and revoke the
 * session. The user would be signed out for the crime of opening a busy page.
 *
 * With it, requests A, B and C await the *same* refresh; one rotation happens;
 * all three retry against the new access token.
 */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * "Stop asking until something signs in again."
 *
 * Set when a refresh is refused outright, which means this browser has no usable
 * refresh cookie — the ordinary state of every signed-out visitor. Without the
 * latch, the first signed-out page load would fire a refresh request for *each*
 * private query that 401s, and every cold load would pay for a request nobody
 * needed. A successful sign-in or sign-out resets it.
 */
let refreshRefused = false;

/** Ask the server to rotate the session. Never exposes a token to this layer. */
async function performRefresh(): Promise<boolean> {
  if (refreshRefused) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        // The refresh POST is itself a state-changing request that carries the
        // refresh cookie, so it needs the CSRF token too — and on a cold page the
        // token may not have been seen yet. Prime it first.
        await primeCsrfToken();
        const headers = new Headers({ "Content-Type": "application/json" });
        if (csrfToken) headers.set(CSRF_HEADER, csrfToken);

        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers,
          // Deliberately empty: the cookie is the credential, and a body is where
          // an implementation is most likely to put a token by accident.
          body: "{}",
        });
        rememberCsrfToken(response);
        if (response.ok) return true;
        // 401/403 mean "no usable refresh cookie" — anything else (a 429 from the
        // limiter, a 500) is temporary, so it must not latch the app into
        // believing this browser is signed out.
        if (response.status === 401 || response.status === 403) refreshRefused = true;
        return false;
      } catch {
        // Network failure. Not an answer about the session at all, so the caller
        // fails its own request instead of being told it is signed out.
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Re-arm the refresh path after a real authentication event.
 *
 * Called by login, register and logout: those are the moments when the answer to
 * "does this browser have a session?" changes, and the latch must not outlive it
 * — otherwise a user who signs in on a page that previously 401'd would be
 * signed out again fifteen minutes later by a refresh the client refuses to
 * attempt.
 */
export function resetRefreshState(): void {
  refreshRefused = false;
}

/* ------------------------------- csrf handling ----------------------------- */

/** The header the server echoes the double-submit token in, and expects back. */
const CSRF_HEADER = "X-CSRF-Token";

/**
 * The CSRF token, held in memory and never in storage.
 *
 * The server sets an HttpOnly `revaro_csrf` cookie and echoes the same value in
 * the `X-CSRF-Token` **response** header. This module sends it back on every
 * state-changing request. It deliberately does *not* read the browser cookie jar
 * (the cookie is HttpOnly, and this codebase's rule is that client JavaScript
 * never touches it) — the response header is the channel, and a cross-site
 * attacker cannot read it either.
 */
let csrfToken: string | null = null;

/**
 * An in-flight call to `GET /api/auth/csrf`, shared so a burst of mutations on a
 * cold page primes once rather than once per request.
 */
let csrfPriming: Promise<void> | null = null;

function rememberCsrfToken(response: Response): void {
  const value = response.headers.get(CSRF_HEADER);
  if (value) csrfToken = value;
}

/**
 * Guarantee a token before the first mutation on a cold page.
 *
 * Any prior response would have carried the header, but a page whose very first
 * request is a mutation (a deep link straight to "add to cart") has seen none yet.
 * `GET /api/auth/csrf` exists exactly for this: it mints the cookie and returns
 * the header without racing the mutation that needs it.
 */
async function primeCsrfToken(): Promise<void> {
  if (csrfToken) return;
  if (!csrfPriming) {
    csrfPriming = fetch("/api/auth/csrf", { credentials: "include" })
      .then(rememberCsrfToken)
      .catch(() => {
        // A failed prime is not fatal: the mutation will proceed without the
        // header and the server will refuse it with CSRF_TOKEN_INVALID, which is
        // the honest answer rather than a silent, unexplained failure.
      })
      .finally(() => {
        csrfPriming = null;
      });
  }
  return csrfPriming;
}

/* ---------------------------------- request -------------------------------- */

async function request<T>(
  path: string,
  options: RequestInit = {},
  attempt = 0,
): Promise<{ data: T; pagination?: ApiEnvelope<T>["pagination"]; response: Response }> {
  const method = (options.method ?? "GET").toUpperCase();
  const mutating = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (mutating) await primeCsrfToken();

  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (mutating && csrfToken) headers.set(CSRF_HEADER, csrfToken);

  const response = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  // The server may rotate the token at any time; adopt whatever this response carried.
  rememberCsrfToken(response);

  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    // non-JSON response
  }

  if (!response.ok || !body?.success) {
    // The access token expired — the ordinary consequence of a fifteen-minute
    // lifetime and a tab left open, not an error the user should ever see.
    // Exchange the refresh cookie for a new access token and replay *once*.
    //
    // `attempt === 0` is what caps this at one retry: a second failure means the
    // refresh itself did not solve the problem, and replaying it again is how a
    // refresh loop starts. The codes are narrow on purpose — `WRONG_PASSWORD`
    // and `INVALID_CREDENTIALS` are also 401s, and refreshing would neither help
    // them nor be appropriate.
    if (
      response.status === 401 &&
      body?.error?.code === "UNAUTHENTICATED" &&
      attempt === 0 &&
      (await performRefresh())
    ) {
      return request<T>(path, options, attempt + 1);
    }

    throw new ApiError(
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
    );
  }

  return { data: body.data as T, pagination: body.pagination, response };
}

export const api = {
  /**
   * Optional `RequestInit` lets a caller pass an `AbortSignal` — typed
   * suggestions hand TanStack Query's own signal through, so navigating away
   * or a newer keystroke cancels the previous fetch instead of racing it.
   */
  get: <T>(path: string, options?: RequestInit) => request<T>(path, options),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  // An optional body, because DELETE carries a payload in a couple of places
  // (removing a stored image names the object). Omitting it behaves exactly as
  // before, so existing callers are unaffected.
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
