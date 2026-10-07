import { createFileRoute } from "@tanstack/react-router";
import { BecomeSellerPage } from "@/features/seller-dashboard/onboarding";
import { requireAuth } from "@/lib/auth/guards";

/**
 * `/seller/become-a-seller` — onboarding.
 *
 * `requireAuth`, **not** `requireSeller`. This is the one seller route that has
 * to be reachable by somebody who is not yet a seller — that is its entire
 * purpose, and it is where `requireSeller` sends a customer. A seller who arrives
 * here anyway sees their existing profile pre-filled and can update it, which is
 * why the form is seeded from `GET /seller/onboarding` rather than being blank.
 */
export const Route = createFileRoute("/seller/become-a-seller")({
  beforeLoad: requireAuth,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: BecomeSellerPage,
});
