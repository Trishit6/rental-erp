import { createFileRoute } from "@tanstack/react-router";
import { CheckoutPage } from "@/features/checkout";
import { requireAuth } from "@/lib/auth/guards";

export const Route = createFileRoute("/checkout")({
  beforeLoad: requireAuth,
  component: CheckoutPage,
});
