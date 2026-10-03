import { createFileRoute } from "@tanstack/react-router";
import { AdminModerationPage } from "@/features/admin";

/**
 * `/admin/moderation` — reports, reviews and suspended accounts.
 * Guarded by the parent layout's `requireAdmin`.
 */
export const Route = createFileRoute("/admin/moderation")({
  component: AdminModerationPage,
});
