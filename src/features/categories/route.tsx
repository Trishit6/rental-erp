import { parseCategorySearch } from "./components/schema";
import { CategoriesPage, CategoryPage } from "./index";

/**
 * Route options for `/categories`, kept with the feature so the thin files in
 * `src/routes/categories/` only declare the path. TanStack Router still owns the
 * route tree (file-based routing scans `src/routes/`).
 */
export const categoriesRouteOptions = {
  component: CategoriesPage,
};

/**
 * `/categories/$categorySlug`. The search validator is the category-scoped one —
 * it reuses the shared product-search parser and then drops `category`, because on
 * this page the category is the route, not a query parameter.
 */
export const categoryDetailRouteOptions = {
  validateSearch: parseCategorySearch,
  component: CategoryPage,
};
