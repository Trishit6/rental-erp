import { createFileRoute } from "@tanstack/react-router";
import { AdminRefundsPage } from "@/features/admin";

/**
 * `/admin/refunds` — the refund review queue (PROMPT 28).
 *
 * This used to render the payments ledger with its type pinned to `REFUND`. That was
 * a view of money that had *already* moved. A refund request is a different fact —
 * money somebody has asked to move and an operator has to decide — so it needs its
 * own queue rather than being folded into the ledger. The ledger itself is still at
 * `/admin/payments`.
 *
 * Guarded by the parent layout's `requireAdmin`; the approval inside additionally
 * requires `refunds.approve` and a step-up, both enforced server-side.
 */
export const Route = createFileRoute("/admin/refunds")({
  component: AdminRefundsPage,
});
