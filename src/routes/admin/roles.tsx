import { createFileRoute } from "@tanstack/react-router";
import { AdminRolesPage } from "@/features/admin";

/** `/admin/roles` — the RBAC role editor. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/roles")({
  component: AdminRolesPage,
});
