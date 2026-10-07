import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, Package, RefreshCcw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import { formatInr } from "@/lib/pricing";
import { useDashboardOrders } from "../query";

/**
 * The five most recent orders, straight from the real `/orders` endpoint. The
 * status badges are the *same* `OrderStatusBadge` the order history renders —
 * there is deliberately no second status vocabulary for the dashboard.
 *
 * Failure here never takes the rest of the page down: the section shows a
 * Retry affordance and the neighbouring cards keep rendering.
 */
export function RecentOrders() {
  const { data, isPending, isError, refetch } = useDashboardOrders();

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-extrabold">
          <ShoppingBag size={16} aria-hidden className="text-primary" />
          Recent Orders
        </h2>
        {data && data.orders.length > 0 && (
          <Link to="/orders" className="text-xs font-bold text-primary hover:underline">
            View all
          </Link>
        )}
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <SectionError label="Orders failed to load" onRetry={() => void refetch()} />
      ) : data && data.orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="Your purchases and rental bookings will appear here."
          action={
            <Link
              to="/browse"
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-foreground hover:text-primary"
            >
              Browse products
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
        />
      ) : (
        <ul className="mt-4 divide-y divide-[var(--divider)]">
          {(data?.orders ?? []).slice(0, 5).map((order) => {
            const ref = order.orderNumber ?? String(order.id);
            const date = format(new Date(order.createdAt), "d MMM yyyy");
            return (
              <li key={order.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{order.preview?.title ?? "Order"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ref} · {date} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="hidden items-center gap-1.5 text-sm font-black tabular-nums sm:flex">
                  {formatInr(order.total)}
                </span>
                <OrderStatusBadge status={order.paymentStatus} size="sm" className="hidden md:inline-flex" />
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: ref }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  View
                  <ArrowRight size={12} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function SectionError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-destructive/8 px-4 py-3">
      <p className="text-sm font-semibold text-destructive">{label}</p>
      <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
        <RefreshCcw size={13} aria-hidden />
        Retry
      </Button>
    </div>
  );
}