import { useState } from "react";
import { Loader2, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The stock control for one listing.
 *
 * ## Three numbers, two of them editable
 *
 * **Total** and **Available** are the seller's levers. **Reserved** is displayed
 * and is `total − available` — there is deliberately no input for it, because it
 * is what live orders are holding. A seller who could type over it could sell the
 * same physical unit twice, and the only correct way to release a committed unit
 * is to cancel the order, which the order flow does through
 * `adjustProductInventory`.
 *
 * The field is shown as `readOnly` with an explanation rather than hidden,
 * because "why can't I release that one?" is a question the seller will ask, and
 * an unexplained missing field is worse than a greyed-out one that says why.
 *
 * ## The clamp is shown, not silently applied
 *
 * Raising **Total** below the current **Available** would be impossible. The
 * server refuses it with `INVALID_STOCK`; this form prevents it by clamping
 * availability down to the new total, and says so in the hint. Silently clamping
 * in the *request* instead would be worse: the seller would set five, have four
 * appear, and not know why.
 */
export function ProductInventoryDialog({
  open,
  onOpenChange,
  product,
  onSave,
  saving = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: number; title: string; quantity: number; availableQuantity: number };
  onSave: (edit: { quantity?: number; availableQuantity?: number }) => void;
  saving?: boolean;
}) {
  // Seeded from the product, and re-seeded whenever a *different* product's dialog
  // opens, so an abandoned edit cannot leak into the next listing. This is the
  // documented derive-state-during-render pattern: React re-runs the component
  // immediately with the new state and discards this pass's output.
  const [draft, setDraft] = useState(() => seed(product));
  if (draft.productId !== product.id) setDraft(seed(product));

  const total = clampInt(draft.quantity, 0, 999);
  const avail = clampInt(draft.available, 0, 999);
  const clamped = Math.min(avail, total);
  const reserved = Math.max(0, total - clamped);

  function save() {
    onSave({ quantity: total, availableQuantity: clamped });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stock</DialogTitle>
          <DialogDescription>{product.title}</DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-sm font-bold">Total units</span>
              <Input
                inputMode="numeric"
                value={draft.quantity}
                onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-sm font-bold">Available now</span>
              <Input
                inputMode="numeric"
                value={draft.available}
                onChange={(event) => setDraft({ ...draft, available: event.target.value })}
              />
            </label>
          </div>

          <div className="inset-surface rounded-2xl p-3">
            <p className="flex items-center gap-2 text-sm font-bold">
              <PackageSearch size={15} aria-hidden className="text-primary" />
              Reserved: {reserved}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Committed to live orders. You can't release these directly — cancel the order instead
              and the unit comes back automatically.
            </p>
          </div>

          {clamped < avail && (
            <p className="text-xs font-semibold text-destructive">
              Available can't be more than the total, so it will be saved as {clamped}.
            </p>
          )}

          {clamped === 0 && (
            <p className="text-xs text-muted-foreground">
              With no units available this listing will be marked out of stock. It stays visible in
              search — that is what a sold-out listing is, not a withdrawn one.
            </p>
          )}
        </div>

        <DialogFooter className="mt-5">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 size={15} aria-hidden className="animate-spin" />}
            Save stock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The form's starting point for a given product. */
function seed(product: { id: number; quantity: number; availableQuantity: number }) {
  return {
    productId: product.id,
    quantity: String(product.quantity),
    available: String(product.availableQuantity),
  };
}

function clampInt(value: string, min: number, max: number): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}
