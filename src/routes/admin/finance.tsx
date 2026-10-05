import { createFileRoute } from "@tanstack/react-router";
import { AdminFinancePage } from "@/features/admin";

/** `/admin/finance` — aggregated totals. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/finance")({
  component: AdminFinancePage,
});