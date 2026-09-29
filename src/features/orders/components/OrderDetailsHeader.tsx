import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Package } from "lucide-react";
import { format } from "date-fns";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { orderTypeLabel, type OrderDetail } from "../types";

/**
 * The detail page header: which order, when, and where it stands.
 *
 * `Back to Orders` is a real link rather than a `history.back()` call, so it
 * works when the page is opened directly from a shared URL — a back button that
 * only works if you arrived from somewhere is a trap.
 */
export function OrderDetailsHeader({ order }: { order: OrderDetail }) {
  return (
    <header className="space-y-4">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Back to Orders
      </Link>

      <div className="raised-surface space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5">
              <Package size={12} aria-hidden="true" />
              {orderTypeLabel(order.orderType)}
            </p>
            <h1 className="section-title mt-1 break-words text-2xl">
              {order.orderNumber ? `Order #${order.orderNumber}` : `Order #${order.id}`}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={12} aria-hidden="true" />
              Placed on {format(new Date(order.createdAt), "d MMMM yyyy")}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <OrderStatusBadge status={order.paymentStatus} size="sm" />
          <span aria-hidden="true">·</span>
          <span>{order.deliveryMethod === "DELIVERY" ? "Delivery" : "Pickup"}</span>
        </div>
      </div>
    </header>
  );
}
