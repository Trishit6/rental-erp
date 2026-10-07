import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import { requireAuth } from "@/lib/auth/guards";

/**
 * The authenticated workspace — a pathless layout that gives every signed-in
 * account page the same application chrome.
 *
 * ## Why the guard lives here and not on each page
 *
 * Every account route (orders, rentals, profile, messages, …) used to repeat
 * `beforeLoad: requireAuth` for itself. This layout moves the check to exactly
 * one place: while the session is resolving it bounces to `/auth-check`; a guest
 * is sent to `/login?redirect=<where>` so they land back where they were aiming
 * after signing in; a signed-in user reaches the children. A page that is
 * rendered at all, then, has already been authorised by the server's session —
 * the guard is the doorway, not a per-page reminder.
 *
 * The root layout hides the public storefront header/footer whenever a route
 * under this tree matches, so the pages here render only the workspace chrome:
 * the sidebar, the topbar (search, notifications, cart, profile) and the content
 * column. `/admin` keeps its own fully separate shell.
 */
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: requireAuth,
  component: AuthenticatedLayout,
});