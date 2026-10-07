import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings";

/**
 * `/settings` — account preferences (theme, notification channels).
 *
 * Rendered inside the `_authenticated` layout, so it is only reachable with a
 * real session.
 */
export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});