import { createFileRoute } from "@tanstack/react-router";
import { DashboardOrdersPage } from "@/features/seller-orders";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/dashboard/orders")({
  beforeLoad: requireAuth,
  component: DashboardOrdersPage,
});
