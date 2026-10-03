import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { formatInr } from "@/lib/pricing";
import { FavoriteControl } from "@/features/favorites/components/FavoriteButton";
import { cn } from "@/lib/utils/cn";
import { CartItemImage } from "./CartItemImage";
import { CartItemDetails } from "./CartItemDetails";
import { CartItemMode } from "./CartItemMode";
import { CartItemQuantity } from "./CartItemQuantity";
import { RentalDurationControl } from "./RentalDurationControl";
import { CartValidationMessage } from "./CartValidationMessage";
import { clampCartQuantity, isUnavailable, unitPriceLabel } from "./schema";
import type { CartItem, UpdateCartItemInput } from "../types";

/**
 * One line in the cart.
 *
 * Purpose-built rather than reusing `ProductCard`: a cart row is denser, shows
 * a price breakdown instead of a headline price, and carries controls (quantity,
 * duration, mode) a browse card has no reason for. It reuses the shared card's
 * surfaces and price formatting so the two never look like different products.
 *
 * Every control is a server-backed cart update. Nothing here mutates a line
 * locally and hopes the server agrees — the mode decides the dates and the
 * merge, and the quantity is clamped against real stock.
 */
export function CartItemCard({
  item,
  onUpdate,
  onRemove,
  onSave,
  isPending,
  isRemoving,
  favorite,
}: {
  item: CartItem;
  onUpdate: (itemId: number, patch: UpdateCartItemInput) => void;
  onRemove: (itemId: number) => void;
  /** Move between the cart and "saved for later". */
  onSave: (itemId: number, savedForLater: boolean) => void;
  isPending?: boolean;
  isRemoving?: boolean;
  /** The shared favourite state for this product, from the one favourites system. */
  favorite?: { isFavorited: boolean; isPending: boolean; isDisabled: boolean; toggle: () => void };
}) {
  const product = item.product;
  const unavailable = isUnavailable(item);
  const [removing, setRemoving] = useState(false);

  function update(patch: UpdateCartItemInput) {
    onUpdate(item.id, patch);
  }

  function handleRemove() {
    if (removing) return;
    setRemoving(true);
    onRemove(item.id);
    toast("Removed from cart", {
      action: { label: "Undo", onClick: () => onUpdate(item.id, { quantity: item.quantity }) },
    });
  }

  const title = product?.title ?? "Unavailable item";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "raised-surface rounded-3xl p-4",
        item.savedForLater && "opacity-85",
        unavailable && "opacity-80",
      )}
      aria-label={`Cart item: ${title}`}
    >
      <div className="flex gap-3.5 sm:gap-4">
        <CartItemImage src={product?.primaryImage ?? null} alt={title} slug={product?.slug} />

        <div className="min-w-0 flex-1">
          <CartItemDetails item={item} />

          {!unavailable && item.mode === "BUY" && (
            <CartItemQuantity
              value={item.quantity}
              availableQuantity={product?.availableQuantity ?? 1}
              onChange={(next) =>
                update({ quantity: clampCartQuantity(next, product?.availableQuantity ?? 1) })
              }
              isPending={isPending}
              label={title}
            />
          )}

          {item.mode === "RENT" && !unavailable && (
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <RentalDurationControl item={item} onUpdate={update} disabled={isPending} />
              <CartItemQuantity
                value={item.quantity}
                availableQuantity={product?.availableQuantity ?? 1}
                onChange={(next) =>
                  update({ quantity: clampCartQuantity(next, product?.availableQuantity ?? 1) })
                }
                isPending={isPending}
                label={title}
              />
            </div>
          )}

          <CartValidationMessage issues={item.issues} className="mt-3" />

          {/* Line-level actions: switch mode, keep, remove, and the shared heart. */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!unavailable && <CartItemMode item={item} onUpdate={update} disabled={isPending} />}

            <button
              type="button"
              onClick={() => onSave(item.id, !item.savedForLater)}
              disabled={isPending}
              className="text-xs font-bold text-primary underline-offset-4 transition hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {item.savedForLater ? "Move to cart" : "Save for later"}
            </button>

            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving || isPending}
              aria-label={`Remove ${title} from cart`}
              className="inline-flex items-center gap-1 text-xs font-bold text-destructive transition hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
            >
              <Trash2 size={13} aria-hidden />
              {isRemoving ? "Removing…" : "Remove"}
            </button>

            {favorite && (
              <FavoriteControl
                title={title}
                isFavorited={favorite.isFavorited}
                isPending={favorite.isPending}
                isDisabled={favorite.isDisabled}
                onClick={favorite.toggle}
                className="size-7"
              />
            )}
          </div>
        </div>

        {/* The price column: a purchase is a flat price, a rental shows the
            multiplication so the arithmetic is never hidden. */}
        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[11px] font-semibold text-muted-foreground">{unitPriceLabel(item)}</p>
          {item.quantity > 1 && (
            <p className="text-[11px] text-muted-foreground">× {item.quantity}</p>
          )}
          <p className="mt-0.5 font-heading text-base font-extrabold">
            {formatInr(item.pricing.lineTotal)}
          </p>
          {item.mode === "RENT" && item.pricing.depositTotal > 0 && (
            <p className="mt-0.5 text-[11px] font-semibold text-accent">
              + {formatInr(item.pricing.depositTotal)} deposit
            </p>
          )}
        </div>
      </div>

      {/* On mobile the price moves below the controls, where there is room. */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--divider)] pt-3 sm:hidden">
        <p className="text-[11px] font-semibold text-muted-foreground">{unitPriceLabel(item)}</p>
        <p className="font-heading text-base font-extrabold">{formatInr(item.pricing.lineTotal)}</p>
      </div>
    </motion.article>
  );
}
