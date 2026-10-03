import { createFileRoute } from "@tanstack/react-router";
import { sellerAnalyticsRouteOptions } from "@/features/seller-dashboard/route";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/dashboard/analytics` — revenue, orders and top listings over a period.
 *
 * `requireSeller`: the aggregates behind this page are one seller's own, and
 * every request re-derives the scope from the session, so there is no way to ask
 * for somebody else's numbers. The guard exists so a customer is offered
 * onboarding instead of loading a page whose every request would 403.
 */
export const Route = createFileRoute("/dashboard/analytics")({
  beforeLoad: requireSeller,
  ...sellerAnalyticsRouteOptions,
});
