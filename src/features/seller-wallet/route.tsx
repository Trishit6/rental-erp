import { useNavigate, useSearch } from "@tanstack/react-router";
import { SellerWalletPage } from "./index";
import { parseWalletSearch, resolveWalletParams, toWalletSearch } from "./components/schema";
import type { WalletParams } from "./types";

/**
 * The `/seller/wallet` route options.
 *
 * The window and the filter are URL state, parsed once at the router, for the reason
 * `seller-dashboard/route.tsx` does the same for the analytics period: a wallet view
 * is the one financial page a seller genuinely shares — with a co-owner deciding
 * whether to take a listing down, or with themselves in six weeks when they ask
 * whether last month was better than the month before. "Last 30 days, payouts only" is
 * not a description of a dataset, it is a *decision*, and it is only reproducible if
 * it travels with the link.
 *
 * ## But the window is still resolved per-request, server-side
 *
 * A link is not a snapshot. `?range=30d` means the last thirty days **as of now, in
 * the reader's own timezone** — which is the behaviour, not a bug: the words have to
 * keep meaning the last thirty days. Someone who wants fixed dates uses the custom
 * range, and that pair *is* frozen in the URL.
 */
export const sellerWalletRouteOptions = {
  validateSearch: (search: Record<string, unknown>) => parseWalletSearch(search),
  component: SellerWalletRoute,
};

function SellerWalletRoute() {
  const search = useSearch({ from: "/seller/wallet" });
  const navigate = useNavigate();
  const params = resolveWalletParams(search);

  return (
    <SellerWalletPage
      params={params}
      onParamsChange={(next: WalletParams) =>
        void navigate({
          to: "/seller/wallet",
          search: toWalletSearch(next),
          // Replace, not push: switching between "30 days" and "payouts only" is
          // re-reading the same page, not travelling. Pushing would bury the seller's
          // actual Back destination under every window they tried.
          replace: true,
        })
      }
    />
  );
}
