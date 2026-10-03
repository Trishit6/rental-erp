import { eq } from "drizzle-orm";
import { db } from "../db";
import { orderItems, products } from "../schema";

/**
 * Stock accounting for a listing.
 *
 * ## The one counter
 *
 * `products.available_quantity` is the only number the marketplace treats as
 * "can I still have this?". Checkout reads it, the cart reads it, browse's
 * availability filter reads it, and `order-creation.ts` decrements it. There is no
 * second counter and no derived one, because two counters is how a listing ends
 * up simultaneously sold out and purchasable.
 *
 * So the seller-facing vocabulary is:
 *
 *  - **Total** — `products.quantity`. How many units exist. The seller sets it.
 *  - **Available** — `products.available_quantity`. How many can still be bought.
 *    The seller lowers it directly ("I only have one left") and every checkout
 *    lowers it too.
 *  - **Reserved** — `quantity − available_quantity`. **Read-only.** It is not a
 *    column and there is deliberately no setter: it is the arithmetic difference
 *    between the two above, so a seller cannot "release" stock that a live order
 *    is holding. Freeing a committed unit happens by cancelling the order, which
 *    returns it through `adjustProductInventory`.
 *
 * ## Why the status is derived here and not at each call site
 *
 * `OUT_OF_STOCK` is a *derived* status (`server/lib/product-status.ts`), but two
 * code paths used to derive it independently and one of them wrote a value that
 * is not in the vocabulary at all — `'SOLD'`, which no public query matches, so
 * a listing vanished from Browse the moment its last unit sold. Every writer now
 * goes through `deriveProductStatus`, so "sold out" has exactly one spelling.
 */

/** Statuses a seller chose by hand, which stock changes must never overwrite. */
const MANUAL_STATUSES = ["DRAFT", "PAUSED", "ARCHIVED"] as const;

export function isManualProductStatus(status: string): boolean {
  return (MANUAL_STATUSES as readonly string[]).includes(status);
}

/**
 * The status a listing should hold given a stock level.
 *
 * A seller-chosen state wins: restocking a paused listing must not quietly
 * publish it again. Everything else follows the stock, because `OUT_OF_STOCK` is
 * defined as derived rather than chosen.
 */
export function deriveProductStatus(status: string, availableQuantity: number): string {
  if (isManualProductStatus(status)) return status;
  return availableQuantity <= 0 ? "OUT_OF_STOCK" : "PUBLISHED";
}

/**
 * What a stock edit is allowed to do.
 *
 * Exported so the route and the tests agree on one rule: availability can never
 * exceed the total, and neither can be negative. `quantity` of 0 is allowed
 * because "I own none of these any more" is a real answer; the schema's older
 * `min(1)` on create stays where it is, since a brand-new listing must start with
 * something to sell.
 */
export type InventoryEdit =
  { quantity: number; availableQuantity?: number } | { availableQuantity: number };

export type InventoryValidation =
  { ok: true; quantity: number; availableQuantity: number } | { ok: false; message: string };

export function validateInventoryEdit(
  current: { quantity: number; availableQuantity: number },
  edit: InventoryEdit,
): InventoryValidation {
  if ("quantity" in edit) {
    if (!Number.isInteger(edit.quantity) || edit.quantity < 0 || edit.quantity > 999) {
      return { ok: false, message: "Total stock must be a whole number between 0 and 999." };
    }
  }

  const quantity = "quantity" in edit ? edit.quantity : current.quantity;

  // Left alone unless the seller sends it: raising the total must not silently
  // conjure units that were never there.
  const requested =
    "availableQuantity" in edit && edit.availableQuantity !== undefined
      ? edit.availableQuantity
      : Math.min(current.availableQuantity, quantity);

  if (!Number.isInteger(requested) || requested < 0) {
    return { ok: false, message: "Available stock must be zero or more." };
  }
  if (requested > quantity) {
    return {
      ok: false,
      message: `You have ${quantity} in total, so available stock cannot be more than ${quantity}.`,
    };
  }

  return { ok: true, quantity, availableQuantity: requested };
}

/** Anything that can read and write `products` — the pool or a transaction. */
type Executor = Pick<typeof db, "select" | "update">;

/**
 * Move a listing's availability by `delta` and re-derive its status.
 *
 * Read-then-write with **literals** rather than one clever `UPDATE`. Two
 * expressions that both reference `available_quantity` inside a single `SET`
 * clause depend on MySQL evaluating assignments left to right, which is a
 * detail worth not depending on: getting it wrong double-counts the delta. The
 * row is locked by the caller's transaction (`SELECT ... FOR UPDATE` when one is
 * open), so the read is not a stale guess.
 *
 * Clamps rather than trusting the arithmetic, so a replayed cancellation can
 * never push availability above the total.
 */
export async function adjustProductInventory(
  executor: Executor,
  productId: number,
  delta: number,
): Promise<void> {
  if (delta === 0) return;

  const [row] = await executor
    .select({
      status: products.status,
      quantity: products.quantity,
      availableQuantity: products.availableQuantity,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!row) return;

  const availableQuantity = Math.min(row.quantity, Math.max(0, row.availableQuantity + delta));

  await executor
    .update(products)
    .set({
      availableQuantity,
      status: deriveProductStatus(row.status, availableQuantity),
    })
    .where(eq(products.id, productId));
}

/**
 * Return stock for the purchase lines of an order that is being cancelled.
 *
 * Only `mode = 'BUY'` lines: a rental holds its unit for a date window rather
 * than removing it from stock, so there is nothing to give back — see the
 * availability note in `order-creation.ts`.
 *
 * `alreadyCancelledLineIds` is passed by the caller so a line somebody else
 * already cancelled is **not** credited twice. Restoring stock that was never
 * taken is the same bug as never restoring it: both leave the seller's inventory
 * wrong, and only one of them looks like a feature.
 */
export async function restoreCancelledOrderStock(
  executor: Executor,
  orderId: number,
  alreadyCancelledLineIds: number[] = [],
): Promise<void> {
  const lines = await executor
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      mode: orderItems.mode,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  const skip = new Set(alreadyCancelledLineIds);
  for (const line of lines) {
    if (skip.has(line.id)) continue;
    // A rental holds its unit for a date window rather than removing it from
    // stock, so there is nothing to give back — see the availability note in
    // `order-creation.ts`.
    if (line.mode !== "BUY") continue;
    await adjustProductInventory(executor, line.productId, line.quantity);
  }
}
