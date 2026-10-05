import { createFileRoute } from "@tanstack/react-router";
import { DashboardOrdersPage } from "@/features/seller-orders";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/dashboard/orders` — the orders containing this seller's lines.
 *
 * `requireSeller` rather than `requireAuth`, and the reason is a correctness problem rather
 * than a tidiness one. This page reads `GET /orders`, which is *the customer's own* orders,
 * scoped to the session. Under `requireAuth` a customer who typed this URL saw their own
 * purchases presented as seller revenue — the wrong side of the table, under a heading that
 * says otherwise.
 */
export const Route = createFileRoute("/dashboard/orders")({
  beforeLoad: requireSeller,
  component: DashboardOrdersPage,
});