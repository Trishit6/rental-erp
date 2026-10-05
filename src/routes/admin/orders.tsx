import { createFileRoute } from "@tanstack/react-router";
import { AdminOrdersPage } from "@/features/admin";

/** `/admin/orders` — all orders, every status. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/orders")({
  component: AdminOrdersPage,
});