import { createFileRoute } from "@tanstack/react-router";
import { AdminRevenuePage } from "@/features/admin";

/**
 * `/admin/revenue` — commission, platform revenue and reconciliation (PROMPT 28).
 *
 * Guarded by the parent layout's `requireAdmin`; the endpoint requires `payouts.view`.
 */
export const Route = createFileRoute("/admin/revenue")({
  component: AdminRevenuePage,
});
