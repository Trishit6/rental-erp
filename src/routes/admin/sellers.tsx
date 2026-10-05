import { createFileRoute } from "@tanstack/react-router";
import { AdminSellersPage } from "@/features/admin";

/** `/admin/sellers` — sellers and verification. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/sellers")({
  component: AdminSellersPage,
});