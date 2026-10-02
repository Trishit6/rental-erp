import { Link } from "@tanstack/react-router";
import { PackageOpen, Star } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductImage } from "@/components/shared/product-image";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInr } from "@/lib/pricing";
import type { SellerProductRow, SettableStatus } from "../types";
import {
  ListingTypeBadge,
  PerformanceSummary,
  PriceSummary,
  ProductRowActions,
  StatusBadge,
  StockSummary,
} from "./ProductRowActions";

/**
 * The listings table, and the card list it degrades to on a phone.
 *
 * ## Two layouts, one set of cells
 *
 * A seven-column table is unusable at 375px, and horizontally scrolling a table
 * on a phone is the reason sellers stop updating stock. So below `md` each row
 * becomes a card with the same information in a different arrangement, rather than
 * the table being hidden (which would leave mobile sellers unable to do anything
 * at all) or a reduced column set (which would hide the stock numbers, the one
 * thing they came for).
 *
 * Only one of the two is rendered at a time, and neither fetches — the rows are
 * already in memory, and rendering a hidden `<table>` as well would double the
 * DOM for no benefit.
 */
export function SellerProductList({
  products,
  loading,
  onSetStatus,
  onDuplicate,
  onArchive,
  onDelete,
  onEditStock,
  emptyAction,
}: {
  products: SellerProductRow[];
  loading: boolean;
  onSetStatus: (id: number, status: SettableStatus) => void;
  onDuplicate: (id: number) => void;
  onArchive: (id: number) => void;
  onDelete: (product: SellerProductRow) => void;
  onEditStock: (product: SellerProductRow) => void;
  emptyAction?: React.ReactNode;
}) {
  if (loading) return <ProductListSkeleton />;

  if (products.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="No listings match"
        description="Try clearing a filter, or search for something else. Your listings are never deleted by a filter — they're just not on this page."
        action={emptyAction}
      />
    );
  }

  return (
    <>
      {/* Desktop: the full table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-bold">
                Listing
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Status
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Price
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Stock
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Performance
              </th>
              <th scope="col" className="px-3 py-2 text-right font-bold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <ProductImage
                      src={product.primaryImage}
                      alt=""
                      className="size-11 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0">
                      <Link
                        to="/product/$slug"
                        params={{ slug: product.slug }}
                        className="block truncate font-bold hover:text-primary"
                      >
                        {product.title}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ListingTypeBadge listingType={product.listingType} />
                        <span className="truncate">{product.categoryName}</span>
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={product.status} />
                </td>
                <td className="px-3 py-3">
                  <PriceSummary product={product} />
                </td>
                <td className="px-3 py-3">
                  <StockSummary product={product} />
                </td>
                <td className="px-3 py-3">
                  <PerformanceSummary product={product} />
                </td>
                <td className="px-3 py-3 text-right">
                  <ProductRowActions
                    product={product}
                    onSetStatus={onSetStatus}
                    onDuplicate={onDuplicate}
                    onArchive={onArchive}
                    onDelete={onDelete}
                    onEditStock={onEditStock}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per listing. */}
      <ul className="space-y-3 md:hidden">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              onSetStatus={onSetStatus}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
              onDelete={onDelete}
              onEditStock={onEditStock}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function ProductCard({
  product,
  onSetStatus,
  onDuplicate,
  onArchive,
  onDelete,
  onEditStock,
}: {
  product: SellerProductRow;
  onSetStatus: (id: number, status: SettableStatus) => void;
  onDuplicate: (id: number) => void;
  onArchive: (id: number) => void;
  onDelete: (product: SellerProductRow) => void;
  onEditStock: (product: SellerProductRow) => void;
}) {
  return (
    <article className="inset-surface space-y-3 rounded-3xl p-4">
      <div className="flex gap-3">
        <ProductImage
          src={product.primaryImage}
          alt=""
          className="size-16 shrink-0 rounded-2xl"
        />
        <div className="min-w-0 flex-1">
          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            className="line-clamp-2 font-bold hover:text-primary"
          >
            {product.title}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={product.status} />
            <ListingTypeBadge listingType={product.listingType} />
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="inset-surface rounded-2xl px-2 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Price
          </dt>
          <dd className="mt-0.5 text-xs font-bold">
            {product.purchasePrice !== null ? (
              formatInr(product.purchasePrice)
            ) : product.rentalPricePerDay !== null ? (
              <>
                {formatInr(product.rentalPricePerDay)}
                <span className="text-muted-foreground">/d</span>
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="inset-surface rounded-2xl px-2 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Stock
          </dt>
          <dd className="mt-0.5 text-xs font-bold">
            {product.availableQuantity}/{product.quantity}
          </dd>
        </div>
        <div className="inset-surface rounded-2xl px-2 py-2">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Sold
          </dt>
          <dd className="mt-0.5 text-xs font-bold">{product.soldUnits}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          {product.ratingCount > 0 ? (
            <>
              <Star size={12} aria-hidden className="fill-current text-amber-500" />
              {product.ratingAverage.toFixed(1)} ({product.ratingCount})
            </>
          ) : (
            <span>{product.categoryName}</span>
          )}
        </p>
        <ProductRowActions
          product={product}
          onSetStatus={onSetStatus}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onDelete={onDelete}
          onEditStock={onEditStock}
        />
      </div>
    </article>
  );
}

/** The table's loading shape — same columns, so nothing jumps when data lands. */
export function ProductListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your listings…</span>
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="inset-surface flex items-center gap-3 rounded-2xl p-3"
        >
          <Skeleton className="size-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
