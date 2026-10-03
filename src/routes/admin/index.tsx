import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboardPage } from "@/features/admin";

/**
 * `/admin` — the dashboard.
 *
 * No `beforeLoad` here: the parent `src/routes/admin.tsx` already runs
 * `requireAdmin` before this renders, and re-declaring it would only be a second
 * place to forget to update.
 */
export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});
