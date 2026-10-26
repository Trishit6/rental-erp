import { useFavoriteToggle } from "@/lib/query/favorites";
import { CartItemCard } from "./CartItemCard";
import { CartSkeleton } from "./CartSkeleton";
import { CartUnavailableItem } from "./CartUnavailableItem";
import { activeItems, isUnavailable, savedItems } from "./schema";
import type { CartItem, UpdateCartItemInput } from "../types";

/**
 * The cart's lines, split into what the user is buying now and what they parked
 * for later. Unavailable lines are rendered by their own component because they
 * need different affordances, but they stay in the list and stay removable.
 */
export function CartItemList({
  items,
  onUpdate,
  onRemove,
  onSave,
  pendingItemId,
  removingItemId,
  isLoading,
}: {
  items: CartItem[];
  onUpdate: (itemId: number, patch: UpdateCartItemInput) => void;
  onRemove: (itemId: number) => void;
  onSave: (itemId: number, savedForLater: boolean) => void;
  /** The line a write is currently in flight for, so only it shows as busy. */
  pendingItemId?: number | null;
  removingItemId?: number | null;
  isLoading?: boolean;
}) {
  if (isLoading) return <CartSkeleton />;

  const active = activeItems(items);
  const saved = savedItems(items);

  if (!items.length) return null;

  return (
    <div className="space-y-5">
      {/* Lists with entering/leaving items: REMOVE mode="wait". Use the default
          "sync" (or "popLayout") animation, give each item a stable key (product.id),
          and use layout only where it does not cause shift. */}
      {active.map((item) =>
        isUnavailable(item) ? (
          <CartUnavailableItem
            key={item.id}
            item={item}
            onRemove={onRemove}
            isRemoving={removingItemId === item.id}
          />
        ) : (
          <CartLine
            key={item.id}
            item={item}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onSave={onSave}
            isPending={pendingItemId === item.id}
            isRemoving={removingItemId === item.id}
          />
        ),
      )}

      {saved.length > 0 && (
        <section aria-label="Saved for later" className="space-y-3">
          {saved.map((item) => (
            <CartLine
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onSave={onSave}
              isPending={pendingItemId === item.id}
              isRemoving={removingItemId === item.id}
            />
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * A normal line. It creates its own favourite controller from the one shared
 * favourites system — the same control every product card uses — so saving a
 * cart item and saving a browse card are literally the same action.
 */
function CartLine({
  item,
  onUpdate,
  onRemove,
  onSave,
  isPending,
  isRemoving,
}: {
  item: CartItem;
  onUpdate: (itemId: number, patch: UpdateCartItemInput) => void;
  onRemove: (itemId: number) => void;
  onSave: (itemId: number, savedForLater: boolean) => void;
  isPending: boolean;
  isRemoving: boolean;
}) {
  const favorite = useFavoriteToggle({ productId: item.productId, slug: item.product?.slug });

  return (
    <CartItemCard
      item={item}
      onUpdate={onUpdate}
      onRemove={onRemove}
      onSave={onSave}
      isPending={isPending}
      isRemoving={isRemoving}
      favorite={favorite}
    />
  );
}
