import { createFileRoute } from "@tanstack/react-router";
import { AdminCategoriesPage } from "@/features/admin";

/** `/admin/categories` — the taxonomy. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/categories")({
  component: AdminCategoriesPage,
});