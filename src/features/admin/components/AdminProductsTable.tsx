import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Package,
  PauseCircle,
  PlayCircle,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { ProductImage } from "@/components/shared/product-image";
import { SearchBar } from "@/components/shared/product-filters/SearchBar";
import { formatInr } from "@/lib/pricing";
import { useAdminProductFacets, useAdminProducts, useSetAdminProductStatus } from "../query";
import {
  EMPTY_ADMIN_PRODUCT_FILTERS,
  hasActiveFilters,
  type AdminProductFilters,
  type AdminProductSort,
} from "../types";

/**
 * The admin product catalogue.
 *
 * ## Why the filters live in the URL-less component state but the *query* is server-side
 *
 * Every control here changes one field of `AdminProductFilters`, and that object is
 * the TanStack Query key as well as the request's query string. So a filtered page is
 * a distinct cache entry, arriving back/forward-safe, and the database does the
 * narrowing — the table never holds more than one page of the ~20,000 listings.
 *
 * Sorting is a header click rather than a dropdown so the sortable columns are
 * discoverable. Clicking a new column resets to page 1: staying on page 7 of a
 * different ordering usually lands past the end and shows an empty table.
 */

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "PAUSED", label: "Paused" },
  { value: "ARCHIVED", label: "Archived" },
];

const CONDITION_OPTIONS = [
  { value: "", label: "Any condition" },
  { value: "NEW", label: "New" },
  { value: "LIKE_NEW", label: "Like new" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "USED", label: "Used" },
];

const LISTING_TYPE_OPTIONS = [
  { value: "", label: "Buy or rent" },
  { value: "SALE", label: "For sale" },
  { value: "RENT", label: "For rent" },
  { value: "BOTH", label: "Sale or rent" },
];

/**
 * The header row, declared once and in order.
 *
 * A discriminated union on `key`, so `head.key ? … : …` narrows to the sortable or
 * plain case without a cast.
 *
 * ## Why this is a flat list and not slices of `SORTABLE_COLUMNS`
 *
 * It was: `SORTABLE_COLUMNS.slice(0, 1)` for the title, `.slice(2, 5)` for the
 * prices and stock, `.slice(5)` for the date, with the plain heads written
 * individually between them. That silently dropped the `status` entry — the body
 * still rendered a status cell, so the table drew fine, but the header row had ten
 * cells against eleven columns and every column from `Status` onward was labelled
 * one to the left. Nothing failed: no type error, no warning, no missing text. Only
 * comparing the header list to the spec's column list found it.
 *
 * Deriving two different lists from one array by index is the bug. So there is now a
 * single declaration of what the header row contains, and it is rendered directly.
 * Adding a column means adding it here, in the position it should appear.
 */
type HeadSpec =
  | { key: AdminProductSort; label: string; className?: string }
  | { key: null; label: string; className?: string };

const HEADS: HeadSpec[] = [
  { key: null, label: "Image", className: "w-14" },
  { key: "title", label: "Product" },
  { key: null, label: "Category" },
  { key: null, label: "Seller" },
  { key: null, label: "Condition" },
  { key: "purchasePrice", label: "Sale price" },
  { key: "rentalPricePerDay", label: "Rental price" },
  { key: "quantity", label: "Stock" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created" },
  { key: null, label: "Actions", className: "text-right" },
];

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PUBLISHED: "bg-primary/12 text-primary",
  OUT_OF_STOCK: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PAUSED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ARCHIVED: "bg-muted text-muted-foreground",
};

export function AdminProductsTable() {
  const [filters, setFilters] = useState<AdminProductFilters>(EMPTY_ADMIN_PRODUCT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const facets = useAdminProductFacets();
  const products = useAdminProducts(filters);
  const setStatus = useSetAdminProductStatus();

  /** Every control patches one field and returns to page 1 — see the note above. */
  const update = (patch: Partial<AdminProductFilters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Any category" },
      ...(facets.data?.categories ?? []).map((category) => ({
        value: String(category.id),
        label: category.name,
      })),
    ],
    [facets.data],
  );

  const sellerOptions = useMemo(
    () => [
      { value: "", label: "Any seller" },
      ...(facets.data?.sellers ?? []).map((seller) => ({
        value: String(seller.id),
        label: seller.name,
      })),
    ],
    [facets.data],
  );

  function toggleSort(key: AdminProductSort) {
    setFilters((current) => ({
      ...current,
      sort: key,
      // Same column again flips the direction; a different column starts descending,
      // which is the useful default for the two date-ish columns.
      dir: current.sort === key && current.dir === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }

  const rows = products.data?.rows ?? [];
  const isFirstLoad = products.isLoading && !products.data;

  return (
    <div className="space-y-4">
      {/* -------------------------------- filters -------------------------------- */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBar
            id="admin-product-search"
            label="Search products"
            placeholder="Title or slug — try “camera”"
            value={filters.search}
            onSearch={(term) => update({ search: term })}
            isSearching={products.isFetching && !products.isLoading}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="admin-product-filters"
          >
            <SlidersHorizontal size={15} aria-hidden />
            Filters
            {hasActiveFilters(filters) ? (
              <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[11px] font-extrabold text-primary">
                on
              </span>
            ) : null}
          </Button>
          {hasActiveFilters(filters) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, pageSize: filters.pageSize })
              }
            >
              <X size={15} aria-hidden />
              Clear
            </Button>
          ) : null}
        </div>

        {/* Collapsed by default so the table gets the full column on a laptop; open on demand. */}
        <div
          id="admin-product-filters"
          hidden={!filtersOpen}
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          <NativeSelect
            label="Category"
            value={filters.category === null ? "" : String(filters.category)}
            onChange={(event) =>
              update({ category: event.target.value === "" ? null : Number(event.target.value) })
            }
            options={categoryOptions}
          />
          <NativeSelect
            label="Seller"
            value={filters.seller === null ? "" : String(filters.seller)}
            onChange={(event) =>
              update({ seller: event.target.value === "" ? null : Number(event.target.value) })
            }
            options={sellerOptions}
          />
          <NativeSelect
            label="Status"
            value={filters.status ?? ""}
            onChange={(event) => update({ status: event.target.value || null })}
            options={STATUS_OPTIONS}
          />
          <NativeSelect
            label="Condition"
            value={filters.condition ?? ""}
            onChange={(event) => update({ condition: event.target.value || null })}
            options={CONDITION_OPTIONS}
          />
          <NativeSelect
            label="Listing type"
            value={filters.listingType ?? ""}
            onChange={(event) => update({ listingType: event.target.value || null })}
            options={LISTING_TYPE_OPTIONS}
          />
          <label className="space-y-1">
            <span className="block text-[11px] font-bold text-muted-foreground">Min price (₹)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.minPrice ?? ""}
              onChange={(event) =>
                update({ minPrice: event.target.value === "" ? null : Number(event.target.value) })
              }
              className="inset-surface h-10 w-full rounded-xl px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-bold text-muted-foreground">Max price (₹)</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filters.maxPrice ?? ""}
              onChange={(event) =>
                update({ maxPrice: event.target.value === "" ? null : Number(event.target.value) })
              }
              className="inset-surface h-10 w-full rounded-xl px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>
        </div>
      </Card>

      {/* --------------------------------- table -------------------------------- */}
      <Card className="overflow-hidden p-0">
        {isFirstLoad ? (
          <TableSkeleton />
        ) : products.isError ? (
          <div className="p-4">
            <EmptyState
              icon={Package}
              title="Unable to load products"
              description="We couldn't reach the server for this page of the catalogue. Please try again."
              action={
                <Button type="button" onClick={() => void products.refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Package}
              title={hasActiveFilters(filters) ? "No products match" : "No products yet"}
              description={
                hasActiveFilters(filters)
                  ? "Nothing in the catalogue matches these filters. Try widening the price range or clearing a filter."
                  : "Once sellers publish listings they will appear here."
              }
              action={
                hasActiveFilters(filters) ? (
                  <Button
                    type="button"
                    onClick={() =>
                      setFilters({ ...EMPTY_ADMIN_PRODUCT_FILTERS, pageSize: filters.pageSize })
                    }
                  >
                    Clear filters
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            {/* A count that is explicit about what it counts: the filtered total, not
                the number of rows on this page. */}
            <p className="border-b border-[var(--divider)] px-4 py-2.5 text-xs text-muted-foreground">
              {new Intl.NumberFormat("en-IN").format(products.data?.total ?? rows.length)} product
              {(products.data?.total ?? rows.length) === 1 ? "" : "s"}
              {products.data && products.data.total > rows.length
                ? ` · showing ${rows.length} on this page`
                : ""}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  {HEADS.map((head) =>
                    head.key ? (
                      <SortableHead
                        key={head.label}
                        column={head}
                        filters={filters}
                        onSort={toggleSort}
                        className={head.className}
                      />
                    ) : (
                      <TableHead key={head.label} className={head.className}>
                        {head.label}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isLive = row.status === "PUBLISHED" || row.status === "OUT_OF_STOCK";
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <ProductImage
                          src={row.imageUrl}
                          alt={row.title}
                          label="No photo"
                          className="size-11 shrink-0 overflow-hidden rounded-xl"
                          imgClassName="size-11 object-cover"
                        />
                      </TableCell>
                      <TableCell className="max-w-[16rem]">
                        <p className="truncate font-semibold" title={row.title}>
                          {row.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          #{row.id} · {row.listingType}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.categoryName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.sellerName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.condition.replace("_", " ")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {row.purchasePrice === null ? "—" : formatInr(row.purchasePrice)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {row.rentalPricePerDay === null ? "—" : formatInr(row.rentalPricePerDay)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {row.availableQuantity}
                        <span className="text-muted-foreground">/{row.quantity}</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`whitespace-nowrap ${STATUS_BADGE[row.status] ?? "bg-muted"}`}
                        >
                          {row.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                            <Link to="/product/$slug" params={{ slug: row.slug }}>
                              <ExternalLink size={14} aria-hidden />
                              <span className="sr-only">View {row.title}</span>
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            disabled={setStatus.isPending}
                            onClick={() =>
                              setStatus.mutate({
                                id: row.id,
                                status: isLive ? "PAUSED" : "PUBLISHED",
                              })
                            }
                          >
                            {isLive ? (
                              <PauseCircle size={14} aria-hidden />
                            ) : (
                              <PlayCircle size={14} aria-hidden />
                            )}
                            {isLive ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="border-t border-[var(--divider)] px-4 py-3">
              <Pagination
                page={filters.page}
                totalPages={products.data?.totalPages ?? 1}
                onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function SortableHead({
  column,
  filters,
  onSort,
  className,
}: {
  column: { key: AdminProductSort; label: string };
  filters: AdminProductFilters;
  onSort: (key: AdminProductSort) => void;
  className?: string;
}) {
  const active = filters.sort === column.key;
  const Icon = !active ? ArrowUpDown : filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {column.label}
        <Icon size={12} aria-hidden className={active ? "text-primary" : undefined} />
      </button>
    </TableHead>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
