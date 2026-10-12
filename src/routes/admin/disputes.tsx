import { createFileRoute } from "@tanstack/react-router";
import { AdminDisputesPage } from "@/features/admin";

/** `/admin/disputes` — the order-dispute queue. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/disputes")({
  component: AdminDisputesPage,
});
