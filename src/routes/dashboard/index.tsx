import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/seller-dashboard";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/dashboard` — the seller overview.
 *
 * `requireSeller`, not `requireAuth`. This page is built entirely from
 * `GET /api/seller/summary`, which the server answers with `403 SELLER_REQUIRED` for a
 * plain customer, so `requireAuth` only bought the customer a page whose every request
 * fails.
 *
 * The server enforces this independently (`requireSeller` in `server/lib/seller-access.ts`).
 * The guard here is about not rendering a page that could only fail — it is never the
 * authorization boundary, and the role it reads is the one the server put in the session.
 */
export const Route = createFileRoute("/dashboard/")({
  beforeLoad: requireSeller,
  component: DashboardPage,
});