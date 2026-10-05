import { Archive, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Delete this product?" — with the two possible outcomes named *before* the click.
 *
 * ## Why the copy commits to archive-or-delete in advance
 *
 * `order_items.product_id` is `ON DELETE RESTRICT`, so a listing that has ever been
 * ordered cannot be removed without destroying the line that proves it was sold.
 * The decision is made by the data layer (`lib/admin-product-writer.ts` asks the
 * database and archives when the answer is no), and this dialog's job is to make
 * that promise *before* the admin presses the button rather than explaining it
 * afterwards — a confirmation that turns into a different action is worse than no
 * confirmation at all.
 *
 * `orderCount` comes from the same detail read the edit dialog uses, so the count
 * shown is the count the server will re-check.
 *
 * ## Why the destructive button is `variant="destructive"`
 *
 * Revaro's destructive variant is a tinted red surface with a red border and red
 * label (`components/ui/button.tsx`) — it reads as dangerous without the neon glow
 * a saturated fill would bring, and it stays legible in both themes.
 */
export function AdminDeleteProductDialog({
  product,
  orderCount,
  open,
  onOpenChange,
  onConfirm,
  deleting,
}: {
  product: { id: number; title: string } | null;
  /** `null` while unknown — the dialog will not offer either action until it knows. */
  orderCount: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => void;
  deleting: boolean;
}) {
  if (!product) return null;
  const hasHistory = (orderCount ?? 0) > 0;
  const known = orderCount !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {!known ? "Checking…" : hasHistory ? "Archive this product?" : "Delete this product?"}
          </DialogTitle>
          <DialogDescription>{product.title}</DialogDescription>
        </DialogHeader>

        {/* Not a loading spinner: until the count is known, the honest thing to show
            is nothing but the reason, because the *title and the button* both depend
            on the answer. Guessing "delete" and correcting it afterwards is the
            failure this dialog exists to avoid. */}
        {!known ? (
          <div className="mt-4 space-y-3" aria-busy="true" aria-label="Checking order history">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-warning">
              <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                {hasHistory ? (
                  <>
                    This listing appears on{" "}
                    <strong className="text-foreground">
                      {orderCount} order line{orderCount === 1 ? "" : "s"}
                    </strong>
                    , so it cannot be deleted without destroying a customer's record. It will be{" "}
                    <strong className="text-foreground">archived</strong> instead: the row, its
                    photos and its reviews stay, and it leaves the marketplace.
                  </>
                ) : (
                  <>
                    This listing has never been ordered, so it will be{" "}
                    <strong className="text-foreground">removed completely</strong> — along with its
                    photos, tags, favourites and any carts holding it. This cannot be undone.
                  </>
                )}
              </span>
            </p>
            <p>
              {hasHistory
                ? "You can restore an archived listing at any time from this table."
                : "Archiving is the reversible option if you would rather keep the listing."}
            </p>
          </div>
        )}

        <DialogFooter className="mt-5">
          <Button
            type="button"
            variant="secondary"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            // Refused until the count is known, for the reason above.
            disabled={deleting || !known}
            onClick={() => onConfirm(product.id)}
          >
            {deleting ? (
              <Loader2 size={15} aria-hidden className="animate-spin" />
            ) : hasHistory ? (
              <Archive size={15} aria-hidden />
            ) : (
              <TriangleAlert size={15} aria-hidden />
            )}
            {deleting ? "Working…" : hasHistory ? "Archive listing" : "Delete product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
