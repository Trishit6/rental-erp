import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CalendarDays, Store } from "lucide-react";
import { format } from "date-fns";
import { formatInr } from "@/lib/pricing";
import { prefetchOrder } from "../query";
import { orderTypeLabel, type OrderSummary as OrderSummaryType } from "../types";
import { OrderItemsPreview } from "./OrderItemsPreview";
import { OrderStatusBadge } from "./OrderStatusBadge";

/** The public identifier, falling back to the id only for pre-Feature-10 rows. */
export function orderRef(order: { id: number; orderNumber: string | null }): string {
  return order.orderNumber ?? String(order.id);
}

/**
 * One order in the list.
 *
 * The primary action is a real link, prefetched on hover or focus so opening an
 * order is instant. Prefetch on *intent* rather than on render: eagerly loading
 * every order on the page would be one request per row for data the customer
 * mostly will not open.
 */
export function OrderCard({ order }: { order: OrderSummaryType }) {
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  const ref = orderRef(order);
  const warm = useCallback(() => {
    void prefetchOrder(queryClient, ref);
  }, [queryClient, ref]);

  const primarySeller = order.sellers[0];

  return (
    <motion.article
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="raised-surface overflow-hidden rounded-3xl"
      data-testid={`order-card-${ref}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--divider)] px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-heading text-sm font-extrabold tracking-wide text-foreground">
            {order.orderNumber ? `Order #${order.orderNumber}` : `Order #${order.id}`}
          </h3>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarDays size={11} aria-hidden="true" />
            Placed on {format(new Date(order.createdAt), "d MMM yyyy")}
          </span>
        </div>
        <OrderStatusBadge status={order.status} size="sm" />
      </div>

      <div className="space-y-4 px-5 py-4">
        <OrderItemsPreview preview={order.preview} itemCount={order.itemCount} />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">{orderTypeLabel(order.orderType)}</span>
              {order.rentalStatus && (
                <>
                  {" · "}
                  <OrderStatusBadge status={order.rentalStatus} size="sm" />
                </>
              )}
            </p>
            {primarySeller && (
              <p className="flex items-center gap-1.5">
                <Store size={11} aria-hidden="true" />
                {primarySeller.name}
                {order.sellers.length > 1 ? ` +${order.sellers.length - 1} more` : ""}
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="font-heading text-xl font-black tabular-nums">{formatInr(order.total)}</p>
            {order.depositTotal > 0 && (
              <p className="text-[10px] text-muted-foreground">
                incl. {formatInr(order.depositTotal)} deposit
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 pb-4">
        <OrderStatusBadge status={order.paymentStatus} size="sm" />
        {/* A real anchor styled as the primary action: it prefetches on intent,
            is keyboard-reachable, and can be opened in a new tab. A button with
            an onClick would lose all three. */}
        <Link
          to="/orders/$orderId"
          params={{ orderId: ref }}
          onMouseEnter={warm}
          onFocus={warm}
          className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          View details
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </div>
    </motion.article>
  );
}
