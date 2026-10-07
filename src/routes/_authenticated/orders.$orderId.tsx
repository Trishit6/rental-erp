import { createFileRoute } from "@tanstack/react-router";
import { orderDetailRouteOptions } from "@/features/orders/route";

/**
 * `/orders/$orderId` — protected.
 *
 * The param is the public `RV-2026-XXXXXX` order number (a legacy numeric id is
 * still accepted so older links work). Ownership is enforced on the server, not
 * here: a guard proves the visitor is *a* user, only the API can prove the order
 * is *theirs*.
 */
export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  ...orderDetailRouteOptions,
});
