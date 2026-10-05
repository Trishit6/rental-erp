/**
 * The admin workspace feature.
 *
 * ## One shell, one set of hooks, one set of tables
 *
 * Every `/admin/*` route renders one page from this folder inside `AdminLayout`, and each
 * page is the header plus a table built on `AdminTableScaffold`. That scaffold is the
 * reason thirteen tables exist without thirteen copies of the loading / empty / error /
 * retry states:
 *
 *  - `/admin`                 the dashboard
 *  - `/admin/products`        the catalogue (filter, sort, edit, archive/delete, bulk)
 *  - `/admin/orders`          every order
 *  - `/admin/purchases`       the same table, type pinned to `PURCHASE`
 *  - `/admin/rentals`         every rental, by stage or status
 *  - `/admin/returns`         rentals whose item came back
 *  - `/admin/users`           the account directory
 *  - `/admin/sellers`         sellers and verification
 *  - `/admin/payments`        the money ledger
 *  - `/admin/refunds`         the ledger, type pinned to `REFUND`
 *  - `/admin/reviews`         product reviews
 *  - `/admin/reviews/sellers` reviews a seller replied to
 *  - `/admin/categories`      the taxonomy
 *  - `/admin/finance`         aggregated totals
 *  - `/admin/product-images`  photo sets
 *  - `/admin/audit-log`       who did what
 *  - `/admin/moderation`      reports, reviews and suspended accounts
 *
 * ## Where the authorization guard is, and why not here
 *
 * It is not here. It lives on the route files (`src/routes/admin/*`), which run
 * `beforeLoad: requireAdmin`, and on the server, where `adminRoute.use("*", requireAdmin)`
 * protects every `/api/admin/*` endpoint. A guard in this folder would only run after the
 * page had already been fetched — by which point the data it protects is in the browser.
 */
export { AdminDashboardPage } from "./pages/AdminDashboardPage";
export { AdminProductsPage } from "./pages/AdminProductsPage";
export { AdminOrdersPage } from "./pages/AdminOrdersPage";
export { AdminRentalsPage } from "./pages/AdminRentalsPage";
export { AdminReturnsPage } from "./pages/AdminReturnsPage";
export { AdminUsersPage } from "./pages/AdminUsersPage";
export { AdminSellersPage } from "./pages/AdminSellersPage";
export { AdminPaymentsPage } from "./pages/AdminPaymentsPage";
export { AdminReviewsPage } from "./pages/AdminReviewsPage";
export { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
export { AdminFinancePage } from "./pages/AdminFinancePage";
export { AdminProductImagesPage } from "./pages/AdminProductImagesPage";
export { AdminAuditPage } from "./pages/AdminAuditPage";
export { AdminModerationPage } from "./pages/AdminModerationPage";
export { AdminLayout } from "./components/AdminLayout";
