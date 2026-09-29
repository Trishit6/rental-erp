/**
 * The product (listing) lifecycle.
 *
 * `DRAFT → PUBLISHED ⇄ PAUSED`, plus `OUT_OF_STOCK` (derived from inventory)
 * and `ARCHIVED` (terminal for the seller).
 *
 * Two things this vocabulary exists to get right:
 *
 *  - **`DRAFT` is the column default.** A row inserted without an explicit
 *    status is therefore *invisible* rather than accidentally live. The public
 *    queries are the ones that have to opt a row in, not out.
 *  - **`OUT_OF_STOCK` stays publicly visible.** It is a live listing with no
 *    stock, not a withdrawn one: hiding it would drop a real listing out of
 *    Browse (and drop its collected favourites and views) the moment the last
 *    unit sold. The availability filter already answers "can I get this now"
 *    from `available_quantity`, so nothing here needs to pretend otherwise.
 *
 * The client mirrors this list in `src/lib/types.ts` — the two are asserted to
 * agree in `tests/listing-status.test.ts`, the same way the product filter
 * vocabulary is kept honest, rather than sharing a module across tsconfigs.
 */
export const PRODUCT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "OUT_OF_STOCK",
  "PAUSED",
  "ARCHIVED",
] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/**
 * Statuses a seller may set by hand.
 *
 * `OUT_OF_STOCK` is deliberately absent: it is derived from inventory, so
 * letting a seller assert it would let them claim a listing is sold out while
 * units are still on the shelf.
 */
export const SELLER_SETTABLE_STATUSES = ["PUBLISHED", "PAUSED", "ARCHIVED"] as const;

/**
 * Statuses that may appear in public discovery, product details, the cart and
 * the rental engine. Everything else is seller- or admin-only.
 */
export const PUBLIC_PRODUCT_STATUSES = ["PUBLISHED", "OUT_OF_STOCK"] as const;

/** Statuses a buyer can still transact against. */
export const PURCHASABLE_PRODUCT_STATUSES = ["PUBLISHED"] as const;

export function isProductStatus(value: unknown): value is ProductStatus {
  return typeof value === "string" && (PRODUCT_STATUSES as readonly string[]).includes(value);
}

export function isPubliclyVisible(status: string | null | undefined): boolean {
  return !!status && (PUBLIC_PRODUCT_STATUSES as readonly string[]).includes(status);
}

/** Whether a buyer may add this listing to a cart / place an order for it. */
export function isPurchasable(status: string | null | undefined): boolean {
  return !!status && (PURCHASABLE_PRODUCT_STATUSES as readonly string[]).includes(status);
}

/** A listing a seller is actively running. */
export function isSellerActive(status: string | null | undefined): boolean {
  return status === "PUBLISHED" || status === "OUT_OF_STOCK";
}
