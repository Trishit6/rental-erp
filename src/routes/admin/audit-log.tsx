import { createFileRoute } from "@tanstack/react-router";
import { AdminAuditPage } from "@/features/admin";

/** `/admin/audit-log` — who did what. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/audit-log")({
  component: AdminAuditPage,
});