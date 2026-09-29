import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { itemCountLabel } from "./schema";

/**
 * Confirmation for emptying the cart.
 *
 * Built on the shared `Sheet`, so focus trapping, escape-to-close and the
 * `aria-modal` semantics come from Radix rather than being re-implemented. It is
 * a deliberate speed bump: clearing a cart is easy to trigger accidentally and
 * cannot be undone from here.
 */
export function ClearCartDialog({
  open,
  onOpenChange,
  itemCount,
  onConfirm,
  isClearing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemCount: number;
  onConfirm: () => void;
  isClearing?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Clear your cart?"
      description="Every item will be removed from your cart. The products themselves stay in the marketplace."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isClearing}
            aria-busy={isClearing}
            className="text-destructive"
          >
            <Trash2 size={14} aria-hidden />
            {isClearing ? "Clearing…" : "Clear cart"}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        You have {itemCountLabel(itemCount)} in your cart. You can always add them again later.
      </p>
    </Sheet>
  );
}
