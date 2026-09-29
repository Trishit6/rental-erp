import { createFileRoute } from "@tanstack/react-router";
import { DashboardProductsPage } from "@/features/seller-listings";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/dashboard/products")({
  beforeLoad: requireAuth,
  component: DashboardProductsPage,
});
