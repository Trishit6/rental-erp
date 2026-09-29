import { CartPage } from "./index";

/**
 * Route options for `/cart`, kept with the feature so the thin file in
 * `src/routes` only declares the path and the guard.
 *
 * The cart is server-persisted per user, so there is nothing to parse out of the
 * URL: the page's identity is the session, not a query string.
 */
export const cartRouteOptions = {
  component: CartPage,
};
