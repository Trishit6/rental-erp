import { createFileRoute } from "@tanstack/react-router";
import { AdminPaymentsPage } from "@/features/admin";

/** `/admin/payments` — the money ledger. Guarded by the parent layout's `requireAdmin`. */
export const Route = createFileRoute("/admin/payments")({
  component: AdminPaymentsPage,
});