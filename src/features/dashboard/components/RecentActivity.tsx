import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Activity, Repeat2, ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useDashboardOrders, useDashboardRentals } from "../query";
import type { DashboardActivity } from "../types";

/**
 * A clean activity timeline.
 *
 * The events are *derived from the rows this page already fetched* — each event
 * is a real order (placed) or a real active rental (started) — so nothing here
 * invents activity, and the section costs no extra request. It renders quietly
 * while its two sources are loading and shows an honest "No recent activity
 * yet." when there is nothing behind it.
 */
export function RecentActivity() {
  const orders = useDashboardOrders();
  const rentals = useDashboardRentals();

  const events = useMemo<DashboardActivity[]>(() => {
    const orderEvents: DashboardActivity[] = (orders.data?.orders ?? []).map((order) => ({
      key: `order-${order.id}`,
      kind: "order",
      label: "Order placed",
      href: `/orders/${order.orderNumber ?? order.id}`,
      at: order.createdAt,
      id: order.id,
      description: order.preview?.title ?? "Marketplace order",
    }));

    const rentalEvents: DashboardActivity[] = (rentals.data?.rentals ?? []).map((rental) => ({
      key: `rental-${rental.id}`,
      kind: "rental",
      label: "Rental started",
      href: `/rentals/${rental.id}`,
      at: rental.startDate,
      id: rental.id,
      description: rental.orderItemTitle ?? rental.title,
    }));

    return [...orderEvents, ...rentalEvents]
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 6);
  }, [orders.data, rentals.data]);

  const loading = orders.isPending || rentals.isPending;

  return (
    <Card className="flex flex-col p-5">
      <h2 className="flex items-center gap-2 font-heading text-base font-extrabold">
        <Activity size={16} aria-hidden className="text-primary" />
        Recent Activity
      </h2>

      {loading ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No recent activity yet"
          description="When you place an order or start a rental, it will show up here."
        />
      ) : (
        <ol className="mt-4 space-y-1">
          {events.map((event) => (
            <li key={event.key}>
              <Link
                to={event.href}
                className="flex items-start gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="soft-button mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl text-primary">
                  {event.kind === "order" ? (
                    <ShoppingBag size={14} aria-hidden />
                  ) : (
                    <Repeat2 size={14} aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{event.label}</span>
                  {event.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {event.description}
                    </span>
                  )}
                </span>
                <time
                  dateTime={event.at}
                  className="mt-0.5 shrink-0 text-[11px] font-semibold text-muted-foreground"
                >
                  {format(new Date(event.at), "d MMM, HH:mm")}
                </time>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}