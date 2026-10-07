import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  IndianRupee,
  Repeat2,
  ShieldCheck,
  ShoppingBag,
  Star,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardAdminStats } from "../query";
import { SectionError } from "./RecentOrders";
import { formatInr } from "@/lib/pricing";

/**
 * The platform figures an admin sees on their dashboard — every number is the
 * real `GET /api/admin/stats` totals, the same single cache entry the admin
 * workspace reads. This is an *entry point*: the full administration surfaces
 * live under `/admin`, and this panel points there rather than duplicating any
 * of them.
 */
export function AdminOverviewPanel() {
  const { data, isPending, isError, refetch } = useDashboardAdminStats();

  return (
    <div className="space-y-6">
      <section aria-label="Platform figures" className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {isPending ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card-surface rounded-3xl p-5">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="mt-3 h-3 w-24" />
            </div>
          ))
        ) : isError ? (
          <div className="col-span-full">
            <SectionError label="Platform stats failed to load" onRetry={() => void refetch()} />
          </div>
        ) : data ? (
          [
            { label: "Total Users", value: String(data.totalUsers), icon: UserRound },
            { label: "Total Products", value: String(data.totalProducts), icon: Boxes },
            { label: "Total Orders", value: String(data.totalOrders), icon: ShoppingBag },
            { label: "Active Rentals", value: String(data.activeRentals), icon: Repeat2 },
            { label: "Reviews", value: String(data.reviews), icon: Star },
            { label: "Revenue", value: formatInr(data.totalRevenue), icon: IndianRupee },
          ].map((stat) => (
            <div key={stat.label} className="card-surface rounded-3xl p-5">
              <span className="soft-button flex size-9 items-center justify-center rounded-xl text-primary">
                <stat.icon size={16} aria-hidden />
              </span>
              <p className="mt-3 font-heading text-xl font-black tabular-nums">{stat.value}</p>
              <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">{stat.label}</p>
            </div>
          ))
        ) : null}
      </section>

      <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="soft-button flex size-12 items-center justify-center rounded-2xl text-primary">
            <ShieldCheck size={22} aria-hidden />
          </span>
          <div>
            <h2 className="font-heading text-lg font-extrabold">Admin Workspace</h2>
            <p className="text-sm text-muted-foreground">
              Users, catalogue, orders, rentals, reviews and finance under one roof.
            </p>
          </div>
        </div>
        <Link
          to="/admin"
          className="primary-button inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Open Admin Workspace
          <ArrowRight size={14} aria-hidden />
        </Link>
      </Card>
    </div>
  );
}