import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProductReferences, SellerProductRow } from "../types";

/**
 * "Remove this listing" — and the moment where the app has to be honest about
 * which of two different things is about to happen.
 *
 * ## Why the choice is made *before* the click, not after
 *
 * `order_items.product_id`, `rentals.product_id` and `reviews.product_id` are all
 * FK-`restrict`, so a product that has ever sold physically cannot be deleted.
 * The old handler let the database discover that: the dialog said "delete", the
 * seller clicked, and the API answered a 500 that surfaced as "Something went
 * wrong" — for a request that had actually worked as designed, just not the way
 * the dialog promised.
 *
 * So the reference counts come back with the listing (`references` on the edit
 * read) and this dialog picks the action up front:
 *
 *  - **has history** → the only button is "Archive", and the copy says exactly
 *    what archiving preserves and what it costs (it leaves search).
 *  - **no history** → "Delete" is offered, and archive is still mentioned as the
 *    reversible option, because a seller deleting a listing they might want back
 *    is a foreseeable and recoverable mistake.
 *
 * `PRODUCT_HAS_HISTORY` is still handled as a fallback in the mutation, because
 * the counts in the list row are a snapshot and an order placed between the read
 * and the click changes the answer.
 */
export function RemoveProductDialog({
  product,
  references,
  open,
  onOpenChange,
  onDelete,
  onArchive,
  deleting = false,
  archiving = false,
}: {
  product: SellerProductRow;
  /** `null` while unknown — the dialog then refuses to offer a hard delete. */
  references: ProductReferences | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (id: number) => void;
  onArchive: (id: number) => void;
  deleting?: boolean;
  archiving?: boolean;
}) {
  const hasHistory = (references?.blocking ?? 0) > 0;
  const busy = deleting || archiving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasHistory ? "Archive this listing?" : "Remove this listing?"}</DialogTitle>
          <DialogDescription>{product.title}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          {hasHistory ? (
            <>
              <p>
                This listing has been part of{" "}
                <strong className="text-foreground">
                  {references!.orders} order{references!.orders === 1 ? "" : "s"}
                </strong>{" "}
                and{" "}
                <strong className="text-foreground">
                  {references!.reviews} review{references!.reviews === 1 ? "" : "s"}
                </strong>
                , so it can't be deleted without destroying somebody's record.
              </p>
              <p>Archiving keeps all of that, and takes the listing out of search.</p>
            </>
          ) : (
            <>
              <p>
                This listing has never sold, so it can be removed completely — photos and tags go
                with it.
              </p>
              <p>
                Archive it instead if you'd rather be able to bring it back: archiving keeps the
                listing and only hides it from customers.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="mt-5">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          {!hasHistory && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => onArchive(product.id)}
            >
              {archiving ? (
                <Loader2 size={15} aria-hidden className="animate-spin" />
              ) : (
                <Archive size={15} aria-hidden />
              )}
              Archive instead
            </Button>
          )}
          <Button
            type="button"
            variant={hasHistory ? "default" : "destructive"}
            disabled={busy || references === null}
            onClick={() => (hasHistory ? onArchive(product.id) : onDelete(product.id))}
          >
            {busy && <Loader2 size={15} aria-hidden className="animate-spin" />}
            {hasHistory ? "Archive listing" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
