import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/dashboard";

/**
 * `/dashboard` — the authenticated workspace home.
 *
 * Guarded by the `_authenticated` layout: reaching this component at all means
 * the session resolved to a real user, and the page then adapts to their role
 * (customer marketplace, seller overview or admin platform figures).
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});