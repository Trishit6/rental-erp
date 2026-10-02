import { ProductImage } from "@/components/shared/product-image";
import { cn } from "@/lib/utils/cn";
import type { OrderPreview } from "../types";

/**
 * The thumbnail-and-title strip on an order card.
 *
 * Pulls from the order's snapshot: the image and name are whatever was bought,
 * so a card does not silently rewrite history when a listing is renamed. The
 * "+N more" count comes from the server's `itemCount`, not from a client-side
 * slice that only knows about the current page.
 */
export function OrderItemsPreview({
  preview,
  itemCount,
  className,
}: {
  preview: OrderPreview | null;
  itemCount: number;
  className?: string;
}) {
  const extra = Math.max(0, itemCount - 1);

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span className="raised-surface flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
        <ProductImage src={preview?.imageUrl} alt="" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {preview?.title ?? "No items"}
        </span>
        {extra > 0 && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            + {extra} more item{extra === 1 ? "" : "s"}
          </span>
        )}
      </span>
    </div>
  );
}
