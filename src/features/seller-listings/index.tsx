import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Pagination } from "@/components/shared/pagination";
import type { SellerProductFilters, SellerProductRow, SettableStatus } from "./types";
import { ProductFiltersBar } from "./components/ProductFiltersBar";
import { ProductInventoryDialog } from "./components/ProductInventoryDialog";
import { RemoveProductDialog } from "./components/RemoveProductDialog";
import { SellerProductList } from "./components/SellerProductList";
import {
  useArchiveProductMutation,
  useDeleteProductMutation,
  useDuplicateProductMutation,
  useProductInventoryMutation,
  useProductReferences,
  useProductStatusMutation,
  useSellerProducts,
  forgetProductFromStore,
} from "./query";

/**
 * The seller's listings page — `/seller/products`.
 *
 * ## One page, not a client-side table over everything
 *
 * The previous version fetched every listing the seller owned and let TanStack
 * Table sort and page it in the browser. The seeded sellers have ~6,700 listings
 * each, so that meant a multi-megabyte response to render twenty rows and a
 * re-sort of a 6,000-element array on every keystroke of the search box. Search,
 * filters, sort and pagination are all SQL
 * (`server/lib/seller-product-queries.ts`), and the filter state lives in the URL
 * so a filtered list is a link a seller can paste to a colleague.
 *
 * ## The page takes its filters as props
 *
 * The route owns the search params (`route.tsx` → `validateSearch` →
 * `parseSellerProductsSearch`) and hands the parsed object down. Keeping the
 * state here would mean two sources of truth for the same thing: the URL and a
 * `useState` copy that drifts the moment the seller uses the back button.
 */
export function SellerListingsPage({
  filters,
  onFiltersChange,
}: {
  filters: SellerProductFilters;
  onFiltersChange: (next: SellerProductFilters) => void;
}) {
  const setFilters = onFiltersChange;
  const [stockFor, setStockFor] = useState<SellerProductRow | null>(null);
  const [removing, setRemoving] = useState<SellerProductRow | null>(null);

  const { data, isLoading, isFetching } = useSellerProducts(filters);
  const rows = data?.rows ?? [];
  const pagination = data?.pagination;

  const statusMutation = useProductStatusMutation();
  const inventoryMutation = useProductInventoryMutation();
  const duplicateMutation = useDuplicateProductMutation();
  const archiveMutation = useArchiveProductMutation();
  const deleteMutation = useDeleteProductMutation();

  // A background refetch dims the current page instead of replacing it with a
  // skeleton, so changing a filter does not throw away the rows the seller was
  // reading to find the thing they clicked.
  const stale = isFetching && !isLoading;

  return (
    <div className="page-wrap space-y-6 pb-10 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Your catalogue</p>
          <h1 className="section-title mt-1 text-3xl sm:text-4xl">Listings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Everything you have listed, what it is doing, and how much stock is left. Search and
            filters run against the database, so this stays quick however many listings you own.
          </p>
        </div>
        <Button asChild>
          <Link to="/seller/products/new">
            <PackagePlus size={15} aria-hidden />
            New listing
          </Link>
        </Button>
      </header>

      <ProductFiltersBar filters={filters} onChange={setFilters} total={pagination?.total ?? 0} />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={stale ? "opacity-60 transition-opacity" : undefined}
        aria-busy={stale}
      >
        <SellerProductList
          products={rows}
          loading={isLoading}
          onSetStatus={(id, status: SettableStatus) => statusMutation.mutate({ id, status })}
          onDuplicate={(id) => duplicateMutation.mutate(id)}
          onArchive={(id) => archiveMutation.mutate(id)}
          onDelete={setRemoving}
          onEditStock={setStockFor}
          emptyAction={
            <Button asChild variant="secondary" size="sm">
              <Link to="/seller/products/new">List your first item</Link>
            </Button>
          }
        />
      </motion.div>

      {pagination && (
        <Pagination
          page={filters.page}
          totalPages={pagination.totalPages}
          onPageChange={(page) => setFilters({ ...filters, page })}
        />
      )}

      {stockFor && (
        <ProductInventoryDialog
          open
          onOpenChange={(open) => !open && setStockFor(null)}
          product={stockFor}
          saving={inventoryMutation.isPending}
          onSave={(edit) =>
            inventoryMutation.mutate(
              { id: stockFor.id, ...edit },
              { onSuccess: () => setStockFor(null) },
            )
          }
        />
      )}

      {removing && (
        <RemoveProductFlow
          product={removing}
          onClose={() => setRemoving(null)}
          archive={archiveMutation}
          remove={deleteMutation}
        />
      )}
    </div>
  );
}

/**
 * The remove dialog, plus the one request it needs.
 *
 * Split out as its own component so `useProductReferences` is a hook of a
 * component that is always mounted while it runs — calling it inline from the
 * parent's JSX would make the hook conditional, and the count would be fetched
 * (or not) depending on whether a dialog happened to be open at render time.
 *
 * The counts are fetched **on open** rather than joined into every row of the
 * list: three correlated aggregates per row, on every page, for a dialog that is
 * usually never opened, is a bad trade. `staleTime` is long because the answer
 * only changes when an order is placed, and the mutation handles the
 * `PRODUCT_HAS_HISTORY` refusal as the real backstop.
 */
function RemoveProductFlow({
  product,
  onClose,
  archive,
  remove,
}: {
  product: SellerProductRow;
  onClose: () => void;
  archive: ReturnType<typeof useArchiveProductMutation>;
  remove: ReturnType<typeof useDeleteProductMutation>;
}) {
  const references = useProductReferences(product.id);

  return (
    <RemoveProductDialog
      open
      onOpenChange={(open) => !open && onClose()}
      product={product}
      references={references}
      deleting={remove.isPending}
      archiving={archive.isPending}
      onDelete={(id) =>
        remove.mutate(id, {
          onSuccess: () => {
            forgetProductFromStore(id);
            onClose();
          },
        })
      }
      onArchive={(id) =>
        archive.mutate(id, {
          onSuccess: () => {
            forgetProductFromStore(id);
            onClose();
          },
        })
      }
    />
  );
}
