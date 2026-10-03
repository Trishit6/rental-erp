import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgeIndianRupee,
  Boxes,
  Gauge,
  Handshake,
  Package,
  RefreshCcw,
  Store,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { formatInr } from "@/lib/pricing";
import type { AdminOverview } from "../types";

/**
 * The dashboard's eight overview cards.
 *
 * ## Every number is a real aggregate
 *
 * Each card reads one field of `GET /api/admin/stats`, which is a live `COUNT`/`SUM`
 * in MariaDB. Nothing is a literal and nothing is computed in the browser from a
 * partial list — the dashboard cannot show a total the database would disagree with.
 *
 * The one derived-looking card, "Revenue", is a paise sum from the server formatted
 * for display. Conversion happens only in `formatInr`, the same helper the rest of
 * the app uses, so a rupee figure cannot be off by a factor of 100.
 */

type CardSpec = {
  key: keyof AdminOverview;
  label: string;
  icon: LucideIcon;
  /** Reads the raw value into something displayable. */
  render: (value: number) => string;
  /** Shown under the number to say what the figure excludes, where that is unclear. */
  hint?: string;
};

const CARDS: CardSpec[] = [
  { key: "totalProducts", label: "Total products", icon: Package, render: formatCount },
  {
    key: "activeProducts",
    label: "Active products",
    icon: Boxes,
    render: formatCount,
    hint: "Published or out of stock",
  },
  { key: "totalUsers", label: "Total users", icon: Users, render: formatCount },
  { key: "totalSellers", label: "Total sellers", icon: Store, render: formatCount },
  { key: "totalOrders", label: "Total orders", icon: Handshake, render: formatCount },
  {
    key: "activeRentals",
    label: "Active rentals",
    icon: RefreshCcw,
    render: formatCount,
    hint: "Confirmed, active or awaiting return",
  },
  {
    key: "totalRevenue",
    label: "Total revenue",
    icon: BadgeIndianRupee,
    render: formatInr,
    hint: "Excludes unpaid orders",
  },
  {
    key: "pendingPayouts",
    label: "Pending payouts",
    icon: Gauge,
    render: formatCount,
    hint: "Pending or processing",
  },
];

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function OverviewCards({
  data,
  isLoading,
  isError,
  onRetry,
}: {
  data: AdminOverview | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  // Error first: a skeleton over a failed request tells the administrator nothing,
  // and an empty state would read as "no data" when the truth is "we could not ask".
  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Unable to load the dashboard"
        description="We couldn't reach the server for the current figures. Nothing has been changed — try again in a moment."
        action={
          <Button type="button" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => (
          <Card key={card.key} className="space-y-2.5 p-4">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  // A genuinely empty marketplace is not an error and not a blank page: it gets the
  // same empty-state treatment as any other list, in the same voice.
  const isEmpty = data.totalProducts === 0 && data.totalUsers === 0 && data.totalOrders === 0;

  if (isEmpty) {
    return (
      <EmptyState
        icon={Store}
        title="Nothing here yet"
        description="Once products, sellers and orders exist, this is where the marketplace's headline figures will appear."
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = data[card.key] as number;
        return (
          <Card key={card.key} className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon size={15} aria-hidden />
              <p className="text-xs font-bold">{card.label}</p>
            </div>
            <p className="mt-2 font-heading text-2xl font-extrabold tabular-nums">
              {card.render(value)}
            </p>
            {card.hint ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">{card.hint}</p>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

/** Count formatting for the values the cards render as plain numbers. */
export { formatCount };
