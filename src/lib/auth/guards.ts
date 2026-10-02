import { redirect } from "@tanstack/react-router";
import { isSellerRole } from "@/features/auth/types";
import type { AuthUser } from "./auth-context";

type GuardContext = { user: AuthUser | null; loading?: boolean };

function loginRedirect(from?: string) {
  return redirect({
    to: "/login",
    search: from && from !== "/" ? { redirect: from } : undefined,
  });
}

/** Protected routes: unauthenticated users go to /login?redirect=<where> */
export function requireAuth({
  context,
  location,
}: {
  context: GuardContext;
  location?: { pathname: string };
}) {
  if (context.loading) {
    // Session still resolving — render the pending gate rather than guessing.
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (!context.user) {
    throw loginRedirect(location?.pathname);
  }
}

export function requireAdmin({
  context,
  location,
}: {
  context: GuardContext;
  location?: { pathname: string };
}) {
  if (context.loading) {
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (!context.user) {
    throw loginRedirect(location?.pathname);
  }
  if (context.user.role !== "ADMIN") {
    throw redirect({ to: "/" });
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
export function requireSeller({
  context,
  location,
}: {
  context: GuardContext;
  location?: { pathname: string };
}) {
  if (context.loading) {
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (!context.user) {
    throw loginRedirect(location?.pathname);
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

/** Guest-only routes (login/register): signed-in users go to the dashboard. */
export function requireGuest({ context }: { context: GuardContext }) {
  if (context.loading) {
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (context.user) {
    throw redirect({ to: "/dashboard" });
  }
}
