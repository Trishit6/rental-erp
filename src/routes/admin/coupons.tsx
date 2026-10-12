import { createFileRoute } from "@tanstack/react-router";
import { AdminCouponsPage } from "@/features/admin";

/**
 * `/admin/coupons` — the discount-code desk (PROMPT 31).
 *
 * Guarded by the parent layout's `requireAdmin`. Reads are additionally gated on
 * `coupons.view` and the create/edit/pause/delete writes on `coupons.manage`, both
 * enforced server-side; the page hides the write controls without the grant.
 */
export const Route = createFileRoute("/admin/coupons")({
  component: AdminCouponsPage,
});
