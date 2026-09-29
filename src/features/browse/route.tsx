import { parseProductSearch } from "@/lib/product-search/schema";
import { BrowsePage } from "./index";

/**
 * Route options for `/browse`, kept with the feature so the thin file in
 * `src/routes/` only has to declare the path. TanStack Router still owns the
 * route tree (file-based routing scans `src/routes/`).
 *
 * The search parser is the shared one, so Browse and category pages can never
 * drift into different vocabularies for the same filter.
 */
export const browseRouteOptions = {
  validateSearch: parseProductSearch,
  component: BrowsePage,
};
