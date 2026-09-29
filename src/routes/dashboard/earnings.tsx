import { createFileRoute } from "@tanstack/react-router";
import { DashboardEarningsPage } from "@/features/seller-dashboard/earnings";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/dashboard/earnings")({
  beforeLoad: requireAuth,
  component: DashboardEarningsPage,
});
