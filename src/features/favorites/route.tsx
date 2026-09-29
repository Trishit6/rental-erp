import { parseFavoriteSearch } from "./components/schema";
import { FavoritesPage } from "./index";

/**
 * Route options for `/favorites`, kept with the feature so the thin file in
 * `src/routes/` only has to declare the path and the guard.
 *
 * The search parser is the feature's own: it reuses `lib/product-search`'s
 * tolerant param parsers, so it never throws and it accepts the numbers TanStack
 * Router hands us.
 */
export const favoritesRouteOptions = {
  validateSearch: parseFavoriteSearch,
  component: FavoritesPage,
};
