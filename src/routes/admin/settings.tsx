import { createFileRoute } from "@tanstack/react-router";
import { AdminSettingsPage } from "@/features/admin";

/** `/admin/settings` — platform settings foundation. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
});