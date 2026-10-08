import { createFileRoute } from "@tanstack/react-router";
import { AdminNotificationsPage } from "@/features/admin";

/** `/admin/notifications` — the administrator's own notification feed. Guarded by `requireAdmin`. */
export const Route = createFileRoute("/admin/notifications")({
  component: AdminNotificationsPage,
});