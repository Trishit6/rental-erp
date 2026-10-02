import { createFileRoute } from "@tanstack/react-router";
import { SellerSettingsPage } from "@/features/seller-dashboard/settings";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/dashboard/settings` — the seller's public shopfront.
 *
 * `requireSeller`, because there is nothing to configure before you have a
 * shopfront; `requireSeller` sends non-sellers to onboarding, which *is* the
 * first version of this form.
 */
export const Route = createFileRoute("/dashboard/settings")({
  beforeLoad: requireSeller,
  component: SellerSettingsPage,
});