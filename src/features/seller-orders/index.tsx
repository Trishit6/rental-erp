import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Package } from "lucide-react";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { formatInr } from "@/lib/pricing";
import type { OrderSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";

export function DashboardOrdersPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: queryKeys.orders,
    queryFn: async () => (await api.get<OrderSummary[]>("/orders")).data,
  });

  return (
    <div className="page-wrap space-y-6 pb-10 pt-8">
      <h1 className="section-title text-3xl">My orders</h1>

      {isLoading ? (
        <Card className="h-40 animate-pulse" />
      ) : !orders?.length ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="Your purchases and rentals will show up here."
          action={
            <Button asChild>
              <Link to="/browse">Browse items</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id} className="flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* The public order number, never the raw id — see the orders
                      feature. Falls back for rows created before Feature 10. */}
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: order.orderNumber ?? String(order.id) }}
                    className="font-heading text-sm font-extrabold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    {order.orderNumber ? `Order #${order.orderNumber}` : `Order #${order.id}`}
                  </Link>
                  <Badge className="bg-primary/10 text-primary">{order.status}</Badge>
                  <Badge className="bg-accent/10 text-accent">{order.orderType}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format(new Date(order.createdAt), "d MMM yyyy")} ·{" "}
                  {order.deliveryMethod === "DELIVERY" ? "Delivery" : "Pickup"}
                  {order.trackingNumber ? ` · Tracking ${order.trackingNumber}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-heading text-lg font-black">{formatInr(order.total)}</p>
                <p className="text-[11px] text-muted-foreground">
                  incl. {formatInr(order.depositTotal)} deposit
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
