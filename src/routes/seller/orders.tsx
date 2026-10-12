import { createFileRoute } from "@tanstack/react-router";
import { SellerOrdersPage } from "@/features/seller-orders";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/seller/orders` — the orders containing this seller's lines.
 *
 * `requireSeller` because every query behind this page is seller-scoped: the
 * server reads the seller from the session and puts ownership in the `WHERE`
 * clause, so a customer reaching this URL would be shown a page that only ever
 * 403s. Gating at the route keeps the failure where it belongs instead of
 * painting an error state under a seller heading.
 */
export const Route = createFileRoute("/seller/orders")({
  beforeLoad: requireSeller,
  component: SellerOrdersPage,
});
