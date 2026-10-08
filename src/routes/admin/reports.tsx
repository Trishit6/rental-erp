import { createFileRoute } from "@tanstack/react-router";
import { AdminReportsPage } from "@/features/admin";

/** `/admin/reports` — the reports queue. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/reports")({
  component: AdminReportsPage,
});