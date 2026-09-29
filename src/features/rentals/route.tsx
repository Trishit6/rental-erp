import { RentalDetailsPage, RentalsPage } from "./index";
import { parseRentalsSearch } from "./components/schema";

/**
 * Route options for the rental pages.
 *
 * Kept with the feature so the thin files in `src/routes` declare only the path
 * and the guard. The search validator lives beside the parser the page uses, so
 * the URL contract is defined once.
 *
 * The detail route validates its param inside `RentalDetailsPage` rather than
 * with `params.parse`: an unparseable id there is not a routing error, it is the
 * rental simply not being found, which the page renders as a normal state.
 */
export const rentalsRouteOptions = {
  validateSearch: (search: Record<string, unknown>) => parseRentalsSearch(search),
  component: RentalsPage,
};

export const rentalDetailRouteOptions = {
  component: RentalDetailsPage,
};
