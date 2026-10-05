import { createFileRoute } from "@tanstack/react-router";
import { AdminOrdersPage } from "@/features/admin";

/**
 * `/admin/purchases` — the orders table with the type filter pinned to `PURCHASE`.
 *
 * One implementation, two entry points: a separate purchases *page* would be a second
 * copy of the orders table, and the two would eventually disagree about what a purchase
 * order looks like. Guarded by the parent layout's `requireAdmin`.
 */
export const Route = createFileRoute("/admin/purchases")({
  component: () => <AdminOrdersPage mode="purchases" />,
});
