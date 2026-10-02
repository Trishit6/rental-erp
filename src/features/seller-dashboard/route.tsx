import { useNavigate, useSearch } from "@tanstack/react-router";
import { SellerAnalyticsPage } from "./analytics";
import {
  parseAnalyticsSearch,
  resolveAnalyticsParams,
  toAnalyticsSearch,
} from "./components/schema";
import type { AnalyticsParams } from "./types";

/**
 * The `/dashboard/analytics` route options.
 *
 * The window and the ranking metric are URL state, parsed once at the router.
 * This matters more here than on any other page: the period is a *decision* a
 * seller makes and then argues about ("no, look at the ninety days"), so it has
 * to be reproducible from the link rather than re-typed.
 *
 * See `components/schema.ts` for why the parser degrades instead of throwing, and
 * for the subtlety that `?period=30d` resolves against the moment of the request —
 * which is the behaviour, not a bug.
 */
export const sellerAnalyticsRouteOptions = {
  validateSearch: (search: Record<string, unknown>) => parseAnalyticsSearch(search),
  component: SellerAnalyticsRoute,
};

function SellerAnalyticsRoute() {
  const search = useSearch({ from: "/dashboard/analytics" });
  const navigate = useNavigate();
  const params = resolveAnalyticsParams(search);

  return (
    <SellerAnalyticsPage
      params={params}
      onParamsChange={(next: AnalyticsParams) =>
        void navigate({
          to: "/dashboard/analytics",
          search: toAnalyticsSearch(next),
          // Replace, not push: switching between "30 days" and "90 days" is
          // re-reading the same page, not travelling. Pushing would bury the
          // seller's actual Back destination under every window they tried.
          replace: true,
        })
      }
    />
  );
}