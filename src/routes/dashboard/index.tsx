import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/seller-dashboard";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/dashboard/")({
  beforeLoad: requireAuth,
  component: DashboardPage,
});
