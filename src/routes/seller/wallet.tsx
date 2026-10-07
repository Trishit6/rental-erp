import { createFileRoute } from "@tanstack/react-router";
import { sellerWalletRouteOptions } from "@/features/seller-wallet/route";
import { requireSeller } from "@/lib/auth/guards";

/**
 * `/seller/wallet`.
 *
 * `requireSeller` rather than `requireAuth`, for the reason every other financial
 * seller page uses it: this route renders balances and a payout form, and there is no
 * version of it that a customer should see. The guard is a courtesy — the server
 * enforces the same rule independently in `requireSeller` (`server/lib/seller-access.ts`),
 * and the wallet router takes the seller id from the session on every single query.
 */
export const Route = createFileRoute("/seller/wallet")({
  beforeLoad: requireSeller,
  ...sellerWalletRouteOptions,
});
