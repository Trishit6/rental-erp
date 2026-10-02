import { useNavigate, useSearch } from "@tanstack/react-router";
import { SellerListingsPage } from "./index";
import {
  parseSellerProductsSearch,
  resolveSellerProductFilters,
  toSearchParams,
} from "./components/schema";

/**
 * The `/dashboard/products` route options, including the URL contract.
 *
 * ## Why the page takes its filters as props
 *
 * The list's whole state — search, status, listing type, stock, sort, page — is
 * in the URL. `validateSearch` narrows it once, at the router, so the page and
 * the request can never be looking at different values: an out-of-vocabulary
 * `?sort=cheapest` is corrected *here*, before any component sees it, rather than
 * being forwarded to a query the server would have to reject.
 *
 * Ownership of that state belongs to the router, not the component. Keeping a
 * `useState` copy inside the page would give the URL and the list two truths, and
 * they diverge the moment the seller presses Back — the table would keep showing
 * the last filters they typed while the URL showed the previous page's.
 *
 * This is a *courtesy* validator, not a security boundary: it exists so an
 * obviously-wrong request never leaves the browser.
 * `server/lib/seller-product-queries.ts` re-validates the same vocabulary, and
 * every predicate there is scoped to the session's seller id — which is the part
 * that actually enforces anything.
 */
export const sellerListingsRouteOptions = {
  validateSearch: (search: Record<string, unknown>) => parseSellerProductsSearch(search),
  component: SellerListingsRoute,
};

function SellerListingsRoute() {
  const search = useSearch({ from: "/dashboard/products" });
  const navigate = useNavigate();
  const filters = resolveSellerProductFilters(search);

  return (
    <SellerListingsPage
      filters={filters}
      onFiltersChange={(next) =>
        void navigate({
          to: "/dashboard/products",
          search: toSearchParams(next),
          // Replace rather than push. A seller working through the status chips
          // would otherwise fill the Back button with filter permutations and
          // have to press it a dozen times to leave the page; a genuine *page*
          // change still gets a history entry, because that is a place a Back
          // button is expected to return to.
          replace: next.page === filters.page,
        })
      }
    />
  );
}