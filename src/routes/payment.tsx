import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth/guards";
import { paymentRouteOptions } from "@/features/payment/route";

/**
 * `/payment` — protected. Payments are only reachable for a signed-in user, and
 * the server independently derives the owner from the session cookie rather
 * than from anything in this URL.
 */
export const Route = createFileRoute("/payment")({
  ...paymentRouteOptions,
  beforeLoad: requireAuth,
});
