import { ProductPage } from "./index";

/**
 * Route options for `/product/$slug`, kept beside the feature so the file in
 * `src/routes/` only has to declare the path (TanStack Router still owns the
 * route tree — file-based routing scans `src/routes/`).
 *
 * The reference may be a slug *or* a numeric id (the backend resolves both), so
 * the page validates it with `productIdSchema` and treats anything unusable as
 * "no such product" rather than crashing.
 */
export const productRouteOptions = {
  component: ProductPage,
};
