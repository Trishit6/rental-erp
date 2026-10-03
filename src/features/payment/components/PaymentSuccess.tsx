import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Package, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/pricing";
import type { OrderConfirmation } from "../types";

/**
 * Post-payment confirmation.
 *
 * The order number shown is the server's public `RV-2026-XXXXXX`, never the
 * auto-increment id — a sequential customer-facing identifier leaks order
 * volume and tells a competitor how much business a listing does. It must come
 * from the backend because only the backend knows it.
 */
export function PaymentSuccess({
  confirmation,
  isDevelopmentMock,
}: {
  confirmation: OrderConfirmation;
  isDevelopmentMock: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="page-wrap max-w-lg space-y-6 py-16 text-center" data-testid="payment-success">
      <motion.span
        className="soft-button mx-auto flex size-20 items-center justify-center rounded-3xl text-accent"
        initial={prefersReducedMotion ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <CheckCircle2 size={38} aria-hidden="true" />
      </motion.span>

      <h1 className="section-title text-2xl">Payment successful</h1>
      <p className="text-sm text-muted-foreground">
        Your order has been confirmed. A receipt is on its way to your account.
      </p>

      <div className="raised-surface space-y-2 p-5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Order</span>
          <span
            className="font-heading text-lg font-black tracking-wide"
            data-testid="order-number"
          >
            {confirmation.orderNumber}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-heading text-lg font-black tabular-nums">
            {formatInr(confirmation.total)}
            <span className="ml-1 text-[11px] font-semibold text-muted-foreground">
              {confirmation.currency}
            </span>
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Status</span>
          <span className="font-semibold">{confirmation.paymentStatus}</span>
        </div>
      </div>

      {confirmation.rentalCount > 0 && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Package size={13} aria-hidden="true" />
          Includes {confirmation.rentalCount} rental reservation
          {confirmation.rentalCount === 1 ? "" : "s"}. Return dates are in your rentals.
        </p>
      )}

      {isDevelopmentMock && (
        <p
          className="rounded-xl bg-accent/10 p-3 text-xs leading-relaxed text-muted-foreground"
          data-testid="dev-mock-notice"
        >
          <strong className="text-foreground">Development mode.</strong> No real payment provider is
          configured, so no money was charged. The order above is real and the pipeline is genuine.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          {/* Straight to this order, by its public number. A real router link,
              so the order is resolved from cache rather than a full page load. */}
          <Link to="/orders/$orderId" params={{ orderId: confirmation.orderNumber }}>
            <Package size={15} aria-hidden="true" />
            View order
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/browse">
            <ShoppingBag size={15} aria-hidden="true" />
            Continue shopping
          </Link>
        </Button>
      </div>
    </div>
  );
}
