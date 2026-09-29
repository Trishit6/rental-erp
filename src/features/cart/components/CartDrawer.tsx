import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { formatInr } from "@/lib/pricing";
import { isPurchasable } from "@/lib/types";
import { useRemoveCartItem, useUpdateCartItem, cartErrorMessage } from "@/lib/query/cart";
import { useCartDrawer } from "@/lib/cart/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { CartItemImage } from "./CartItemImage";
import { CartEmptyState } from "./CartEmptyState";
import { CartSkeleton } from "./CartSkeleton";
import { activeItems, itemCountLabel, modeLabel } from "./schema";
import type { Cart, CartItem, UpdateCartItemInput } from "../types";

/**
 * Cart drawer — the same cart, without leaving the page.
 *
 * It reads the *same* `queryKeys.cart` entry as the page and the badge, so it
 * cannot show a different basket. Opening it uses cached data immediately and
 * refetches in the background only if stale — it never blocks on a spinner when
 * it already has something to show.
 *
 * The open state is shared (see `lib/cart/drawer`) because the navbar, the
 * floating dock and every add-to-cart button open it.
 */

export function CartDrawer({
  cart,
  isLoading,
  isError,
}: {
  cart: Cart;
  isLoading: boolean;
  isError?: boolean;
}) {
  const { isOpen, setOpen } = useCartDrawer();
  const reduceMotion = useReducedMotion();
  const items = activeItems(cart.items);
  const isEmpty = !isLoading && !isError && cart.items.length === 0;

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {isOpen && (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]"
                />
              </Dialog.Overlay>

              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.aside
                  // A right-hand panel on desktop, a bottom sheet on mobile —
                  // the same Revaro surfaces either way.
                  initial={reduceMotion ? false : { x: "100%" }}
                  animate={{ x: 0 }}
                  exit={reduceMotion ? undefined : { x: "100%" }}
                  transition={{ type: "spring", damping: 32, stiffness: 320 }}
                  className={cn(
                    "fixed z-[70] flex flex-col bg-[var(--color-background)] outline-none",
                    "inset-y-0 right-0 w-full max-w-[420px] border-l border-[var(--raised-border)]",
                    "shadow-[-12px_0_40px_var(--shadow-color-dark)]",
                  )}
                >
                  <header className="flex items-start justify-between gap-3 border-b border-[var(--divider)] px-5 py-4">
                    <div>
                      <Dialog.Title className="font-heading text-lg font-extrabold">
                        Your cart
                      </Dialog.Title>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {isLoading ? "Loading…" : itemCountLabel(cart.totals.itemCount)}
                      </p>
                    </div>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close cart"
                        className="soft-button flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <X size={16} />
                      </button>
                    </Dialog.Close>
                  </header>

                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    {isLoading ? (
                      <CartSkeleton count={2} />
                    ) : isError ? (
                      <p className="inset-surface rounded-2xl px-4 py-6 text-center text-sm text-muted-foreground">
                        We couldn't load your cart just now. Close this and try again.
                      </p>
                    ) : isEmpty ? (
                      <CartEmptyState />
                    ) : (
                      <ul className="space-y-3" aria-label="Cart items">
                        <AnimatePresence initial={false}>
                          {items.map((item) => (
                            <CartDrawerItem key={item.id} item={item} />
                          ))}
                        </AnimatePresence>
                      </ul>
                    )}
                  </div>

                  {!isEmpty && !isError && (
                    <footer className="space-y-3 border-t border-[var(--divider)] px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-muted-foreground">
                          Subtotal
                        </span>
                        <span className="font-heading text-lg font-black tabular-nums">
                          {formatInr(cart.totals.subtotal)}
                        </span>
                      </div>

                      {cart.totals.securityDeposits > 0 && (
                        <div className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="font-semibold text-accent">
                            Refundable deposits
                          </span>
                          <span className="font-bold tabular-nums text-accent">
                            {formatInr(cart.totals.securityDeposits)}
                          </span>
                        </div>
                      )}

                      <div className="neumo-divider" />

                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-heading text-base font-extrabold">
                          Estimated total
                        </span>
                        <span className="font-heading text-xl font-black tabular-nums">
                          {formatInr(cart.totals.estimatedTotal)}
                        </span>
                      </div>

                      {/* The drawer's job is to get the user to the cart, where
                          the validation gate and the full summary live — one
                          checkout path, not two with different checks. */}
                      <Button asChild size="lg" className="w-full">
                        <Link to="/cart" onClick={() => setOpen(false)}>
                          View cart
                          <ArrowRight size={15} aria-hidden />
                        </Link>
                      </Button>

                      <Dialog.Close asChild>
                        <button
                          type="button"
                          className="w-full rounded-full py-2 text-xs font-bold text-muted-foreground transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        >
                          Continue shopping
                        </button>
                      </Dialog.Close>
                    </footer>
                  )}
                </motion.aside>
              </Dialog.Content>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A compact drawer row: image, title, the mode + duration, quantity and price.
 * Deliberately lighter than the page's `CartItemCard` — a 420px panel has no room
 * for the full control set, and the page is one tap away.
 */
function CartDrawerItem({ item }: { item: CartItem }) {
  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();

  const title = item.product?.title ?? "Unavailable item";
  const unavailable = !item.product || !isPurchasable(item.product.status);

  function handleUpdate(patch: UpdateCartItemInput) {
    update.mutate(
      { itemId: item.id, patch },
      { onError: (error) => toast.error(cartErrorMessage(error)) },
    );
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="raised-surface flex gap-3 rounded-2xl p-3"
    >
      <CartItemImage
        src={item.product?.primaryImage ?? null}
        alt={title}
        slug={item.product?.slug}
        className="size-16"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-sm font-extrabold">{title}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
          {modeLabel(item.mode)}
          {item.mode === "RENT" && ` · ${item.rentalDuration}d`}
          {item.quantity > 1 && ` · ×${item.quantity}`}
        </p>

        {unavailable && (
          <p className="mt-1 text-[11px] font-bold text-destructive">Currently unavailable</p>
        )}

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="font-heading text-sm font-extrabold tabular-nums">
            {formatInr(item.pricing.lineTotal)}
          </p>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Decrease quantity of ${title}`}
              disabled={item.quantity <= 1 || update.isPending}
              onClick={() => handleUpdate({ quantity: item.quantity - 1 })}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              −
            </button>
            <span className="min-w-5 text-center text-xs font-bold tabular-nums">
              {item.quantity}
            </span>
            <button
              type="button"
              aria-label={`Increase quantity of ${title}`}
              disabled={update.isPending}
              onClick={() => handleUpdate({ quantity: item.quantity + 1 })}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              +
            </button>

            <button
              type="button"
              aria-label={`Remove ${title} from cart`}
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(item.id, {
                  onError: (error) => toast.error(cartErrorMessage(error)),
                })
              }
              className="ml-1 flex size-6 items-center justify-center rounded-full text-destructive transition hover:bg-destructive/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </motion.li>
  );
}
