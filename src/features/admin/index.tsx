/**
 * The admin workspace feature.
 *
 * Three routes share one shell, one set of query hooks and one stylesheet:
 *
 *  - `/admin`             the dashboard
 *  - `/admin/products`    the catalogue
 *  - `/admin/moderation`  reports, reviews and suspended accounts
 *
 * The authorization guard is *not* here. It lives on the route files
 * (`src/routes/admin*`), which run `beforeLoad: requireAdmin`, and on the server,
 * where `adminRoute.use("*", requireAdmin)` protects every `/api/admin/*` endpoint.
 * A guard in this folder would only run after the page had already been fetched.
 */
export { AdminDashboardPage } from "./pages/AdminDashboardPage";
export { AdminProductsPage } from "./pages/AdminProductsPage";
export { AdminModerationPage } from "./pages/AdminModerationPage";
export { AdminLayout } from "./components/AdminLayout";
