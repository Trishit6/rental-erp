import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireGuest } from "@/lib/auth/guards";

type AuthSearch = { redirect?: string };

/**
 * Pathless layout for guest-only pages (login/register).
 * Renders NO chrome of its own — the root layout already provides the site
 * navbar. This layout exists purely to apply the guest guard to its children.
 */
function AuthLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/_auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: requireGuest,
  component: AuthLayout,
});
