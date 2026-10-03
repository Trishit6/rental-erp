import { AdminPageHeader } from "../components/AdminLayout";
import { AdminProductsTable } from "../components/AdminProductsTable";

/**
 * `/admin/products` — the catalogue.
 *
 * Just the header and the table. The filtering, sorting and paging all live in
 * `AdminProductsTable`, which owns the single `AdminProductFilters` object that is
 * simultaneously the component state, the query key and the request's query string —
 * so there is one source of truth for "what is on screen".
 */
export function AdminProductsPage() {
  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Catalog"
        title="Products"
        description="Every listing in the marketplace. Search and filters run in the database, so this stays fast at any catalogue size."
      />
      <AdminProductsTable />
    </div>
  );
}
