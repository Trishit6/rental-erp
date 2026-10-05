import { createFileRoute } from "@tanstack/react-router";
import { AdminReturnsPage } from "@/features/admin";

/** `/admin/returns` — closed rentals. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/returns")({
  component: AdminReturnsPage,
});