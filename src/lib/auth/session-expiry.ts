import { queryKeys } from "../query/keys";
import { ApiError } from "../api/client";

/**
 * Detecting that the session died underneath the app.
 *
 * ## Why this is its own module
 *
 * TanStack Query v5 removed `onError` from *query* options and exposes it on `QueryCache`
 * instead — as a constructor argument, not an assignable property. So the only way to see
 * every query's failure is to build the `QueryClient` with a `QueryCache` that has the
 * handler, which means the decision has to be reachable from `createQueryClient()` without
 * that file importing React or the auth context.
 *
 * Hence this module: a predicate, and a one-slot handler the `AuthProvider` installs. The
 * dependency runs query-cache → this module → the provider, and nothing loops back.
 */

/**
 * Whether an error means "this device's session is no longer valid".
 *
 * Deliberately narrow, because the cost of being wrong is signing a legitimate user out:
 *
 *  - `401` alone is not enough. An endpoint could use 401 for something other than the
 *    session, and reading it as an expiry would eject a user who did nothing wrong.
 *  - `403` is a *role* problem with a perfectly good session — a customer opening `/admin`.
 *    Treating that as an expiry is exactly the "the app is broken" bug a role check must
 *    never cause.
 *  - `UNAUTHENTICATED` is the specific code `requireUser` raises, and matching on it makes
 *    the whole rule nameable: only the session-not-recognized answer counts.
 */
export function isSessionExpiredError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401 && error.code === "UNAUTHENTICATED";
}

/** Is this the query that resolves the session itself? */
export function isSessionQuery(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === queryKeys.auth[0];
}

type SessionExpiredHandler = () => void;

let handler: SessionExpiredHandler | null = null;

/**
 * Install the app-wide reaction to an expired session.
 *
 * Pass `null` to uninstall. The provider does this on unmount so a torn-down tree does not
 * keep a closure alive, and so a second provider in the same process (a test) replaces the
 * handler rather than stacking on top of it.
 */
export function setSessionExpiredHandler(next: SessionExpiredHandler | null): void {
  handler = next;
}

/**
 * Report that some query just learned the session is gone.
 *
 * Called from the query cache's `onError`, so it runs for *every* failing query in the app
 * — which is the point: an expiry does not announce itself at one place, it surfaces from
 * whichever request happened to be in flight, and that is a different component each time.
 */
export function reportSessionExpired(): void {
  handler?.();
}