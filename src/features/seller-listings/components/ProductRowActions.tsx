import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, Copy, MoreHorizontal, Package, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { STATUS_LABELS, type SellerProductRow } from "../types";

/**
 * The per-row actions on a listing.
 *
 * ## Which transitions are offered, and why
 *
 * The set is derived from the row's current status rather than being a fixed
 * toolbar of five buttons:
 *
 *  - `DRAFT` → Publish. A draft has never been seen by a customer, so publishing
 *    is the only forward move that changes anything for them.
 *  - `PUBLISHED` / `OUT_OF_STOCK` → Pause. Takes it out of search without
 *    destroying the URL, the reviews or the ranking.
 *  - `PAUSED` → Publish.
 *  - `ARCHIVED` → nothing. It is terminal, and the server enforces that too
 *    (`LISTING_ARCHIVED` on any attempt to move it back) so a stale tab cannot
 *    undo a decision the seller made deliberately.
 *
 * Archive and delete are separated deliberately. "Archive" is reversible and keeps
 * every order line, review and favourite; "Delete" is only offered for a listing
 * that has never sold, and even then it explains itself before it acts.
 */
export function ProductRowActions({
  product,
  onSetStatus,
  onDuplicate,
  onArchive,
  onDelete,
  onEditStock,
  busy = false,
}: {
  product: SellerProductRow;
  onSetStatus: (id: number, status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED") => void;
  onDuplicate: (id: number) => void;
  onArchive: (id: number) => void;
  onDelete: (product: SellerProductRow) => void;
  onEditStock: (product: SellerProductRow) => void;
  busy?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const archived = product.status === "ARCHIVED";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {!archived && (
        <>
          {product.status === "PUBLISHED" || product.status === "OUT_OF_STOCK" ? (
            <IconAction
              label="Pause this listing"
              disabled={busy}
              onClick={() => onSetStatus(product.id, "PAUSED")}
            >
              <Pause size={14} />
            </IconAction>
          ) : (
            <IconAction
              label="Publish this listing"
              disabled={busy}
              onClick={() => onSetStatus(product.id, "PUBLISHED")}
            >
              <Play size={14} />
            </IconAction>
          )}

          <Link
            to="/dashboard/products/$productId/edit"
            params={{ productId: String(product.id) }}
            aria-label="Edit this listing"
            className="rounded-full p-1.5 transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Pencil size={14} />
          </Link>

          <IconAction label="Update stock" disabled={busy} onClick={() => onEditStock(product)}>
            <Package size={14} />
          </IconAction>
        </>
      )}

      <div className="relative">
        <IconAction
          label="More actions"
          disabled={busy}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal size={14} />
        </IconAction>

        {menuOpen && (
          <>
            {/* Click-away layer: a menu that only closes on its own trigger is a
                menu that traps the seller once they click anywhere else. */}
            <button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="raised-surface absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-2xl p-1">
              {archived ? (
                // An archived listing is terminal, so the only thing left to do
                // with it is look at it.
                <Link
                  to="/product/$slug"
                  params={{ slug: product.slug }}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition hover:bg-primary/10"
                >
                  <Copy size={14} aria-hidden />
                  View listing
                </Link>
              ) : (
                <>
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate(product.id);
                    }}
                  >
                    <Copy size={14} aria-hidden />
                    Duplicate as draft
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onArchive(product.id);
                    }}
                  >
                    <Archive size={14} aria-hidden />
                    Archive
                  </MenuItem>
                  <MenuItem
                    destructive
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(product);
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                    Delete
                  </MenuItem>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
  ...rest
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full p-1.5 transition hover:bg-primary/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      {...rest}
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  onClick,
  destructive = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
        destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-primary/10"
      }`}
    >
      {children}
    </button>
  );
}

/** The status pill, coloured by what the status means rather than by its name. */
export function StatusBadge({ status }: { status: string }) {
  // Semantic scale, so a `PUBLISHED` pill here is the same colour as the one in
  // the admin catalogue (`AdminProductsTable`) and the wallet ledger — it used to
  // be raw emerald, which matched nothing else in the app.
  const tone =
    status === "PUBLISHED"
      ? "bg-success/15 text-success"
      : status === "OUT_OF_STOCK"
        ? "bg-warning/15 text-warning"
        : status === "PAUSED"
          ? "bg-info/15 text-info"
          : status === "ARCHIVED"
            ? "bg-muted text-muted-foreground"
            : "bg-muted text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Buy / rent / both, in the words a customer would use. */
export function ListingTypeBadge({ listingType }: { listingType: string }) {
  const label =
    listingType === "SALE" ? "For sale" : listingType === "RENT" ? "For rent" : "Sale or rent";
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
      {label}
    </span>
  );
}

/** Both prices, or whichever one applies. A dash where there is no price. */
export function PriceSummary({ product }: { product: SellerProductRow }) {
  return (
    <div className="text-xs leading-relaxed">
      {product.purchasePrice !== null && (
        <p className="font-bold">{formatInr(product.purchasePrice)}</p>
      )}
      {product.rentalPricePerDay !== null && (
        <p className={product.purchasePrice !== null ? "text-muted-foreground" : "font-bold"}>
          {formatInr(product.rentalPricePerDay)}
          <span className="font-normal text-muted-foreground">/day</span>
        </p>
      )}
      {product.purchasePrice === null && product.rentalPricePerDay === null && (
        <p className="text-muted-foreground">—</p>
      )}
    </div>
  );
}

/** The stock cell: total, available, and reserved as a read-only footnote. */
export function StockSummary({ product }: { product: SellerProductRow }) {
  return (
    <div className="text-xs leading-relaxed">
      <p className="font-bold">
        {product.availableQuantity} of {product.quantity}
      </p>
      {product.reservedQuantity > 0 && (
        <p className="text-muted-foreground">{product.reservedQuantity} reserved</p>
      )}
    </div>
  );
}

/** A "1 sold · 2 rented · 4.5 rated (12)" line. Empty when there is nothing to report. */
export function PerformanceSummary({ product }: { product: SellerProductRow }) {
  const parts: string[] = [];
  if (product.soldUnits > 0) parts.push(`${product.soldUnits} sold`);
  if (product.rentalCount > 0) parts.push(`${product.rentalCount} rented`);
  // Spelled out rather than "4.5★": U+2605 renders as a coloured emoji star on
  // several platforms, which is the one place this string was styled differently
  // from every `<Star>` in the app — and it is announced as "black star" by a
  // screen reader. The number and the count say the same thing without either.
  if (product.ratingCount > 0)
    parts.push(`${product.ratingAverage.toFixed(1)} rated (${product.ratingCount})`);
  if (parts.length === 0) {
    return <span className="text-xs text-muted-foreground">No sales yet</span>;
  }
  return <span className="text-xs text-muted-foreground">{parts.join(" · ")}</span>;
}
