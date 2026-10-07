import { createFileRoute } from "@tanstack/react-router";
import { DashboardEarningsPage } from "@/features/seller-dashboard/earnings";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/seller/earnings` — this seller's own earnings, from `GET /api/seller/earnings`.
 *
 * `requireSeller` rather than `requireAuth`: the endpoint is behind the server's
 * `requireSeller`, so the guard only avoids rendering a page that could not load. The role
 * it reads comes from the session the server resolved — never from anything the client
 * sends.
 */
export const Route = createFileRoute("/seller/earnings")({
  beforeLoad: requireSeller,
  component: DashboardEarningsPage,
});