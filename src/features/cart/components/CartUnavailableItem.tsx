import { Ban, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CartItemImage } from "./CartItemImage";
import { CartValidationMessage } from "./CartValidationMessage";

/**
 * A line the user can no longer act on: the listing was deleted, retired, or is
 * the user's own.
 *
 * The line is kept visible on purpose — silently deleting it would make the
 * cart quietly change under the user and lose the rest of their basket. What it
 * cannot do is proceed: it is excluded from the totals the checkout gate uses, so
 * a dead line can never be ordered. Removal is always offered.
 */
export function CartUnavailableItem({
  item,
  onRemove,
  isRemoving,
}: {
  item: {
    id: number;
    product: { slug: string; title: string } | null;
    savedForLater: boolean;
    issues: CartValidationMessageProps;
  };
  onRemove: (itemId: number) => void;
  isRemoving?: boolean;
}) {
  const title = item.product?.title ?? "This product is no longer available";

  return (
    <article
      className="raised-surface flex flex-col gap-3 rounded-3xl p-4 opacity-90 sm:flex-row sm:items-center"
      aria-label={`Unavailable: ${title}`}
    >
      <CartItemImage src={null} alt={title} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Ban size={15} aria-hidden className="shrink-0 text-destructive" />
          <h3 className="font-heading text-sm font-extrabold">{title}</h3>
        </div>

        <p className="mt-1 text-xs font-bold text-destructive">Currently unavailable</p>

        <CartValidationMessage issues={item.issues} className="mt-2" />

        {item.product && (
          <Link
            to="/product/$slug"
            params={{ slug: item.product.slug }}
            className="mt-2 inline-block text-xs font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            View the listing
          </Link>
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onRemove(item.id)}
        disabled={isRemoving}
        aria-busy={isRemoving}
        className="shrink-0"
      >
        <Trash2 size={14} aria-hidden />
        {isRemoving ? "Removing…" : "Remove"}
      </Button>
    </article>
  );
}

type CartValidationMessageProps = Parameters<typeof CartValidationMessage>[0]["issues"];
