import { createFileRoute } from "@tanstack/react-router";
import { AdminUsersPage } from "@/features/admin";

/** `/admin/users` — the account directory. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
});