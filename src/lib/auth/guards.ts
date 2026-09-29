import { redirect } from "@tanstack/react-router";
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

/** Guest-only routes (login/register): signed-in users go to the dashboard. */
export function requireGuest({ context }: { context: GuardContext }) {
  if (context.loading) {
    throw redirect({ to: "/auth-check", replace: true });
  }
  if (context.user) {
    throw redirect({ to: "/dashboard" });
  }
}
