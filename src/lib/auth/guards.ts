import { redirect } from "@tanstack/react-router";
import { isSellerRole } from "@/features/auth/types";
import type { AuthUser } from "./auth-context";

type GuardContext = { user: AuthUser | null; loading?: boolean };

/** The shape of the router's location these guards read. */
type GuardLocation = { pathname: string; searchStr?: string };

/** Where a signed-in user belongs when they did not arrive from a specific page. */
export function homeFor(user: AuthUser | null | undefined): string {
  return isSellerRole(user?.role) ? "/dashboard" : "/profile";
}

/**
 * Keep only destinations that are unambiguously our own pages.
 *
 * ## Why this is not a no-op
 *
 * `redirect` travels through the URL (`/login?redirect=/orders`), which means it is
 * attacker-controllable: a link to `/login?redirect=https://evil.example` is one
 * `Link` away. Handing that straight to `navigate({ to })` after a successful login is
 * the classic post-login open redirect — the user signs in on a real Revaro page and is
 * then forwarded somewhere that can imitate the page they were just on.
 *
 * Three shapes are refused, and they are different attacks:
 *  - `https://evil.example` — an absolute URL to another origin.
 *  - `//evil.example`    — protocol-relative; browsers read this as absolute.
 *  - `/\evil.example`    — the backslash form, which several browsers normalise to `/`.
 *
 * The accepted set is deliberately narrow: a path beginning with exactly one `/` and
 * containing no backslash. Everything else falls back to the caller's default, which is
 * always a real in-app route.
 */
export function safeRedirect(target: unknown, fallback: string): string {
  if (typeof target !== "string" || target.length === 0) return fallback;
  if (!target.startsWith("/")) return fallback;
  if (target.startsWith("//") || target.includes("\\") || target.includes("\n")) return fallback;
  return target;
}

/**
 * The login redirect that remembers where the visitor was trying to go.
 *
 * ## Why `pathname + searchStr` and not `pathname`
 *
 * `/browse?search=drill` and `/browse` are different pages to a user. Dropping the query
 * string landed them on an unfiltered catalogue with none of their context, which reads
 * as "the app forgot where I was" — the same symptom as a redirect that silently failed.
 *
 * `href` is deliberately not used: it is absolute (`https://app.example/browse?…`), so it
 * would either fail `safeRedirect` every time or force it to parse an origin out of a
 * string. Reassembling from the two path components cannot produce an off-origin value at
 * all, which is the stronger property.
 */
function loginRedirect(location: GuardLocation | undefined) {
  const attempted = safeRedirect(
    location ? `${location.pathname}${location.searchStr ?? ""}` : undefined,
    "",
  );
  return redirect({
    to: "/login",
    search: attempted ? { redirect: attempted } : undefined,
  });
}

/** Protected routes: unauthenticated users go to /login?redirect=<where> */
export function requireAuth({ context, location }: { context: GuardContext; location?: GuardLocation }) {
  if (context.loading) {
    // Session still resolving — render the pending gate rather than guessing.
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (!context.user) {
    throw loginRedirect(location);
  }
}

export function requireAdmin({ context, location }: { context: GuardContext; location?: GuardLocation }) {
  if (context.loading) {
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (!context.user) {
    throw loginRedirect(location);
  }
  if (context.user.role !== "ADMIN") {
    // Sent to their own account rather than to a bare 403 page. A customer who typed
    // `/admin` is not looking for an error, they are looking for their account — and the
    // destination is deliberately *not* `/login`, because they are already signed in:
    // bouncing a signed-in visitor to the login page is how redirect loops start.
    throw redirect({ to: homeFor(context.user), replace: true });
  }
}

/**
 * Seller routes: signed in **and** a seller.
 *
 * ## Why this is not the same as `requireAuth`
 *
 * Every `/dashboard/*` route used `requireAuth`, which asks only "is there a
 * session?". So a customer could open the seller dashboard, and the pages
 * behind it either failed (the API answered `403 SELLER_REQUIRED`) or, worse,
 * quietly showed the wrong thing — the orders tab was wired to the *customer's*
 * `/orders` endpoint and the rentals tab to `/rentals?role=all`, which is both
 * sides of the table. The role is the whole point of the guard.
 *
 * ## Why a customer is offered onboarding rather than bounced
 *
 * Sending a non-seller to `/` tells them nothing about why. Onboarding is a
 * two-field form (bio, location — see `server/lib/seller-access.ts`) and is
 * exactly what the prompt's "unless the application supports seller onboarding"
 * clause contemplates, so the redirect carries the original destination and the
 * dashboard appears when onboarding finishes.
 *
 * The server enforces the same rule independently (`requireSeller` in
 * `server/lib/seller-access.ts`). This guard is about not rendering a page that
 * could only fail, never about authorization.
 */
export function requireSeller({ context, location }: { context: GuardContext; location?: GuardLocation }) {
  if (context.loading) {
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (!context.user) {
    throw loginRedirect(location);
  }
  if (!isSellerRole(context.user.role)) {
    throw redirect({
      to: "/dashboard/become-a-seller",
      // The route's search is `{ redirect: string | undefined }`; the router drops
      // undefined values, so no pathname serializes as no param.
      search: { redirect: location?.pathname },
    });
  }
}

/**
 * Guest-only routes (login/register): signed-in users leave.
 *
 * ## Why the destination depends on the role
 *
 * This sent everyone to `/dashboard`. `/dashboard` is the *seller* workspace — its pages
 * read `/api/seller/*`, which answers `403 SELLER_REQUIRED` for a plain customer — so the
 * one thing it did for an ordinary shopper who opened `/login` by mistake was bounce them
 * into a page that could only fail. `homeFor` sends a customer to their profile and keeps
 * a seller where they actually work.
 *
 * `replace: true` matters here: the sign-in they just completed is not a page they should
 * be able to go "back" to, and a history entry pointing at `/login` is what makes a
 * signed-in user appear signed out on refresh.
 */
export function requireGuest({ context }: { context: GuardContext }) {
  if (context.loading) {
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (context.user) {
    throw redirect({ to: homeFor(context.user), replace: true });
  }
}