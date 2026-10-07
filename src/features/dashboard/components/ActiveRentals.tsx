import { Link } from "@tanstack/react-router";
import { format, differenceInCalendarDays } from "date-fns";
import { ArrowRight, CalendarRange, Repeat2, Sofa } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import { formatInr } from "@/lib/pricing";
import { useDashboardRentals } from "../query";
import { SectionError } from "./RecentOrders";

/** "14 days left" style label; overdue rentals say so rather than a negative count. */
function remainingLabel(endDate: string): string {
  const days = differenceInCalendarDays(new Date(endDate), new Date());
  if (days > 1) return `${days} days left`;
  if (days === 1) return "1 day left";
  if (days === 0) return "Due today";
  return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
}

/**
 * The rentals currently in hand, from the real `/rentals?bucket=active`
 * endpoint — same rows, same statuses, same badge component as My Rentals.
 */
export function ActiveRentals() {
  const { data, isPending, isError, refetch } = useDashboardRentals();

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-extrabold">
          <CalendarRange size={16} aria-hidden className="text-primary" />
          Active Rentals
        </h2>
        {data && data.rentals.length > 0 && (
          <Link to="/rentals" className="text-xs font-bold text-primary hover:underline">
            View all
          </Link>
        )}
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <SectionError label="Rentals failed to load" onRetry={() => void refetch()} />
      ) : data && data.rentals.length === 0 ? (
        <EmptyState
          icon={Sofa}
          title="No active rentals"
          description="You don't have any items in hand right now."
          action={
            <Link
              to="/browse"
              className="soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-foreground hover:text-primary"
            >
              Find something worth renting
              <ArrowRight size={13} aria-hidden />
            </Link>
          }
        />
      ) : (
        <ul className="mt-4 divide-y divide-[var(--divider)]">
          {(data?.rentals ?? []).slice(0, 5).map((rental) => (
            <li key={rental.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {rental.orderItemTitle ?? rental.title}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {format(new Date(rental.startDate), "d MMM")} →{" "}
                    {format(new Date(rental.endDate), "d MMM yyyy")}
                  </span>
                  <span className="font-bold text-primary">{remainingLabel(rental.endDate)}</span>
                </p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-black tabular-nums">{formatInr(rental.total)}</p>
                <OrderStatusBadge status={rental.status} size="sm" className="mt-1" />
              </div>
              <Link
                to="/rentals/$rentalId"
                params={{ rentalId: String(rental.id) }}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Repeat2 size={12} aria-hidden className="sm:hidden" />
                <span className="hidden sm:inline">View</span>
                <ArrowRight size={12} aria-hidden className="hidden sm:inline-block" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}