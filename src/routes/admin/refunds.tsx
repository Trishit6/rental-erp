import { createFileRoute } from "@tanstack/react-router";
import { AdminPaymentsPage } from "@/features/admin";

/**
 * `/admin/refunds` — the payments table with the type filter pinned to `REFUND`.
 *
 * Refunds are a *view of the ledger*, not a separate resource: they are rows in
 * `transactions`, written when the refund flow called the provider. A dedicated refunds
 * page with its own queries would be a second source of truth about money that could
 * disagree with the payments table.
 *
 * There is deliberately no "Refund" button here. Issuing one is the order/payment flow's
 * job, and an admin table that merely flipped a status would report a refund the payment
 * provider never made. Guarded by the parent layout's `requireAdmin`.
 */
export const Route = createFileRoute("/admin/refunds")({
  component: () => <AdminPaymentsPage mode="refunds" />,
});
