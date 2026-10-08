import { createFileRoute } from "@tanstack/react-router";
import { AdminAuditPage } from "@/features/admin";

/** `/admin/audit-logs` — who did what. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/audit-logs")({
  component: AdminAuditPage,
});