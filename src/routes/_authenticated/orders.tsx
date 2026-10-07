import { createFileRoute } from "@tanstack/react-router";
import { ordersRouteOptions } from "@/features/orders/route";

/**
 * `/orders` — protected. Order history is private, so the guard runs in
 * `beforeLoad` and the server independently derives the owner from the session.
 */
export const Route = createFileRoute("/_authenticated/orders")({
  ...ordersRouteOptions,
});
