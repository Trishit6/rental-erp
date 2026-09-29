import { OrderDetailsPage, OrdersPage } from "./index";
import { parseOrdersSearch } from "./components/schema";

/**
 * Route options for the orders pages.
 *
 * Kept with the feature so the thin files in `src/routes` declare only the path
 * and the guard. The search-param validator lives in `components/schema.ts`
 * beside the parser the page itself uses, so the URL contract is defined once
 * and cannot drift between the route and the page.
 *
 * The detail route validates its param inside `OrderDetailsPage` rather than in
 * `params.parse`: an unparseable param there is not a route error, it is the
 * order simply not being found, which the page renders as a normal state.
 */
export const ordersRouteOptions = {
  validateSearch: (search: Record<string, unknown>) => parseOrdersSearch(search),
  component: OrdersPage,
};

export const orderDetailRouteOptions = {
  component: OrderDetailsPage,
};
