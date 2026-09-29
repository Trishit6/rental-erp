import { createFileRoute } from "@tanstack/react-router";
import { DashboardRentalsPage } from "@/features/seller-rentals";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/dashboard/rentals")({
  beforeLoad: requireAuth,
  component: DashboardRentalsPage,
});
