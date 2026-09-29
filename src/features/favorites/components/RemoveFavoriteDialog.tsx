import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/**
 * Confirmation for removing a single saved item *or* clearing the whole
 * wishlist. Built on the shared `Sheet`, so focus trapping, escape-to-close and
 * the `aria-modal` semantics come from Radix rather than being re-implemented.
 *
 * It is a dialog rather than a silent action because the product itself is never
 * deleted — only the saved relationship — but the user should feel that
 * difference: "Remove" leaves the listing in the marketplace.
 */
export function RemoveFavoriteDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  count,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
  /** Omit for a single item; pass a number to clear the whole list. */
  count?: number;
}) {
  const isClearAll = count !== undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isClearAll ? "Clear all favorites?" : "Remove from favorites?"}
      description={
        isClearAll
          ? "This removes every saved item from your list. The products stay in the marketplace."
          : "This removes the saved item from your list. The product stays in the marketplace."
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Keep them
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
            className="text-destructive"
          >
            <Trash2 size={14} aria-hidden />
            {isPending ? "Removing…" : isClearAll ? "Clear all" : "Remove"}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        {isClearAll
          ? `You're about to remove ${count} saved ${count === 1 ? "item" : "items"}. You can always save them again later.`
          : "You can save it again at any time from the product page."}
      </p>
    </Sheet>
  );
}
