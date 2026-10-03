import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarRange, Loader2, ShoppingBag, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { queryKeys } from "@/lib/query/keys";
import { ApiError } from "@/lib/api/client";
import { cancelOrder } from "../api";
import { useOrderAgain } from "../query";
import type { OrderDetail, OrderItem, OrderRental } from "../types";
import { CANCELLATION_REASON_OPTIONS, type CancellationReasonValue } from "./schema";

const CANCELLATION_REASONS: readonly { value: CancellationReasonValue; label: string }[] =
  CANCELLATION_REASON_OPTIONS;

/**
 * Order actions: Cancel (with a confirmation dialog asking why) and Buy/Rent
 * again.
 *
 * Validity is server-owned. The client hides a button when the state clearly
 * forbids it, but pressing a stale button is still safe: the server answers 409
 * with a readable message, and the dialog simply shows it.
 */
export function OrderActionsPanel({
  order,
  items,
  rentals,
  onOpenChange,
}: {
  order: OrderDetail;
  items: OrderItem[];
  rentals: OrderRental[];
  /** Opens the small "why" dialog; owned by the page so only one dialog shows. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<CancellationReasonValue>("CHANGED_MIND");
  const [otherReason, setOtherReason] = useState("");

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const again = useOrderAgain(order.orderNumber ?? order.id);

  const cancellable =
    order.status === "PENDING_PAYMENT" ||
    order.status === "CONFIRMED" ||
    order.status === "PROCESSING";

  const repeatable = items.filter((item) => item.productSlug !== null);
  const firstRepeatable = repeatable[0];

  function closeDialog(next: boolean) {
    setCancelOpen(next);
    onOpenChange?.(next);
  }

  async function submitCancel() {
    try {
      await cancelOrder(order.orderNumber ?? order.id, {
        reasonCode,
        ...(reasonCode === "OTHER" && otherReason.trim() ? { reason: otherReason.trim() } : {}),
      });
      toast.success("Order cancelled successfully.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderAll });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Couldn't cancel the order. Try again.";
      toast.error(message);
    } finally {
      closeDialog(false);
    }
  }

  async function repeat(orderItemId?: number) {
    try {
      const result = await again.mutateAsync(orderItemId);
      toast.success(result.merged ? "Added to your cart." : "Order added to cart.");
      void navigate({ to: "/cart" });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "This product is no longer available.";
      toast.error(message);
    }
  }

  return (
    <section className="raised-surface p-5" aria-labelledby="order-actions-heading">
      <h2 id="order-actions-heading" className="font-heading text-lg font-extrabold">
        Actions
      </h2>

      <div className="mt-3 flex flex-col gap-2.5">
        {cancellable && (
          <Button variant="destructive" onClick={() => closeDialog(true)}>
            Cancel order
          </Button>
        )}

        {firstRepeatable?.productSlug && (
          <Button onClick={() => void repeat(firstRepeatable.id)} disabled={again.isPending}>
            {again.isPending ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <ShoppingCart size={14} aria-hidden />
            )}
            {firstRepeatable.mode === "RENT" ? "Rent again" : "Buy again"}
          </Button>
        )}

        {/* The per-line "View product" link lives on the item row itself, so only
            the navigation that has no other home belongs here. */}
        {rentals.length > 0 && (
          <Button asChild variant="secondary">
            <Link to="/rentals">
              <CalendarRange size={14} aria-hidden="true" />
              View my rentals
            </Link>
          </Button>
        )}

        <Button asChild variant="secondary">
          <Link to="/browse">
            <ShoppingBag size={14} aria-hidden="true" />
            {order.status === "CANCELLED" ? "Browse similar items" : "Continue shopping"}
          </Link>
        </Button>
      </div>

      {!firstRepeatable && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          The products in this order are no longer listed, so buying them again is not possible.
          Your order record is unaffected.
        </p>
      )}

      <Dialog open={cancelOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <DialogHeader>
              <DialogTitle>Cancel order?</DialogTitle>
              <DialogDescription>
                Why are you cancelling? This helps sellers understand — the order is only cancelled
                once you confirm.
              </DialogDescription>
            </DialogHeader>

            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Reason for cancelling</legend>
              {CANCELLATION_REASONS.map((option) => (
                <label
                  key={option.value}
                  className="inset-surface flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors has-[:checked]:text-primary"
                >
                  <input
                    type="radio"
                    name="cancellation-reason"
                    value={option.value}
                    checked={reasonCode === option.value}
                    onChange={() => setReasonCode(option.value)}
                    className="accent-[var(--color-primary)]"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            {reasonCode === "OTHER" && (
              <textarea
                value={otherReason}
                onChange={(event) => setOtherReason(event.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Tell us more (optional)"
                aria-label="Other reason"
                className="inset-surface mt-3 w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            )}

            <DialogFooter className="mt-5 gap-2">
              <Button variant="ghost" onClick={() => closeDialog(false)}>
                Keep order
              </Button>
              <Button variant="destructive" onClick={() => void submitCancel()}>
                Cancel order
              </Button>
            </DialogFooter>
          </motion.div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
