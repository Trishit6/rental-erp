import { AlertTriangle, Clock, PackageX } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { useAdminOrderHealth } from "../query";
import { formatAdminCount, formatAdminMoney, humanizeEnum } from "./format";
import { ORDER_STATUS_BADGE, NEUTRAL_BADGE, RENTAL_STATUS_BADGE } from "./status-badge";

/**
 * The operations panel: what is late.
 *
 * ## Why this is derived, not stored
 *
 * "Stuck" is a statement about elapsed time, and elapsed time is a fact about the
 * clock — the server recomputes it on every read (`getOrderHealth`) rather than
 * writing a `stuck` flag somewhere. A stored flag would be wrong the moment the
 * thresholds changed and would need a job to maintain; a derived one cannot lie.
 *
 * ## Why the lists open the record rather than acting on it
 *
 * The panel answers "where do I look?", not "what do I click?". A stuck order may
 * need a nudge, an override or a cancellation depending on *why* it stalled, and
 * those are three different decisions with three different consequences. The panel's
 * job is to get the operator to the order — the actions live on the order.
 */
export function AdminOrderHealthPanel({
  onOpenOrder,
}: {
  /** Opens the order detail dialog. Stuck rows fall back to a link when absent. */
  onOpenOrder?: (id: number) => void;
}) {
  const health = useAdminOrderHealth();

  if (health.isLoading && !health.data) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-full" />
      </Card>
    );
  }

  if (health.isError) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted-foreground">Operations health could not be loaded.</p>
        <button
          type="button"
          className="text-sm font-medium underline"
          onClick={() => void health.refetch()}
        >
          Retry
        </button>
      </Card>
    );
  }

  const data = health.data;
  if (!data) return null;

  const healthy = data.stuck.length === 0 && data.overdueReturns.length === 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock size={16} aria-hidden className="text-muted-foreground" />
          <h2 className="text-sm font-bold">Operations health</h2>
          <span className="text-[11px] text-muted-foreground">
            from {new Date(data.generatedAt).toLocaleTimeString("en-IN")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Metric label="Stuck orders" value={data.stuck.length} tone={data.stuck.length > 0} />
          <Metric
            label="Overdue returns"
            value={data.overdueReturns.length}
            tone={data.overdueReturns.length > 0}
          />
          <Metric label="Refunds awaiting review" value={data.pendingRefunds} />
          <Metric label="Open disputes" value={data.openDisputes} />
        </div>
      </div>

      {healthy ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing is late right now — no order has sat in a status past its budget and no rental is
          past its return date.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <HealthList
            title="Stuck orders"
            icon={AlertTriangle}
            empty="Every order is moving on schedule."
            rows={data.stuck.map((order) => ({
              key: `order-${order.id}`,
              to: `/admin/orders`,
              onOpen: onOpenOrder ? () => onOpenOrder(order.id) : undefined,
              title: order.orderNumber ?? `Order ${order.id}`,
              subtitle: `${order.customerName} · ${formatAdminMoney(order.total)}`,
              badge: humanizeEnum(order.status),
              badgeClass: ORDER_STATUS_BADGE[order.status] ?? NEUTRAL_BADGE,
              meta: `${formatDuration(order.ageMs)} in status`,
            }))}
          />

          <HealthList
            title="Overdue returns"
            icon={PackageX}
            empty="Nothing is overdue."
            rows={data.overdueReturns.map((rental) => ({
              key: `rental-${rental.id}`,
              to: `/admin/rentals`,
              title: rental.title,
              subtitle: `${rental.renterName} · deposit ${formatAdminMoney(rental.securityDeposit)}`,
              badge: humanizeEnum(rental.status),
              badgeClass: RENTAL_STATUS_BADGE[rental.status] ?? NEUTRAL_BADGE,
              meta: `${formatAdminCount(rental.daysOverdue)} day(s) overdue`,
            }))}
          />
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium",
        tone ? "bg-destructive/12 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {label}
      <span className="tabular-nums font-bold">{value}</span>
    </span>
  );
}

type HealthRow = {
  key: string;
  to: string;
  onOpen?: () => void;
  title: string;
  subtitle: string;
  badge: string;
  badgeClass: string;
  meta: string;
};

function HealthList({
  title,
  icon: Icon,
  empty,
  rows,
}: {
  title: string;
  icon: typeof AlertTriangle;
  empty: string;
  rows: HealthRow[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={14} aria-hidden className="text-muted-foreground" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--divider)]">
          {rows.map((row) => {
            const body = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{row.meta}</p>
                </div>
                <Badge className={cn("shrink-0 whitespace-nowrap", row.badgeClass)}>
                  {row.badge}
                </Badge>
              </>
            );
            return (
              <li key={row.key}>
                {row.onOpen ? (
                  <button
                    type="button"
                    onClick={row.onOpen}
                    className="flex w-full items-start justify-between gap-3 rounded-lg py-2.5 text-left transition hover:bg-accent/40"
                  >
                    {body}
                  </button>
                ) : (
                  <Link
                    to={row.to}
                    className="flex items-start justify-between gap-3 rounded-lg py-2.5 transition hover:bg-accent/40"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Elapsed milliseconds as `3h 20m` / `2d 4h` / `45m`. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / (60 * 24));
  if (days > 0) return `${days}d ${Math.floor((minutes % (60 * 24)) / 60)}h`;
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
