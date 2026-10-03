import { Link, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Banknote,
  Calendar,
  MessageSquare,
  Package,
  PackagePlus,
  ShoppingBag,
  Star,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { formatInr } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSellerSummary } from "./query";

/**
 * The seller dashboard — `/dashboard`.
 *
 * ## One request, and it is the only one
 *
 * Everything on this page comes from `GET /api/seller/summary`: the product
 * counts, the order counts, the rental counts, the lifetime earnings and the
 * rating. Previously the page also fetched `/rentals?role=all` and counted
 * `ACTIVE` + `CONFIRMED` in the browser — downloading every rental a seller was
 * party to, *on both sides of the table* including rentals where they were the
 * customer, to produce one number.
 *
 * That was not just slow, it was **wrong**: "Active rentals" on a seller's
 * dashboard was counting items they had rented themselves. The backend owns that
 * question (`server/lib/rental-lifecycle.ts` is where a rental's status comes
 * from), so it is now asked there and the browser is told the answer.
 *
 * ## `useLocation()`, not `location`
 *
 * The tab strip used to read the global `location.pathname`. That works in a
 * browser and silently does the wrong thing anywhere else — it cannot see a
 * client-side navigation, so the tab highlight lagged a navigation behind, and
 * it throws outright under SSR or a test environment. `useLocation()` is
 * TanStack Router's own subscription, so the strip re-renders when the route
 * changes and reads from the same router everything else does.
 */

/**
 * The tabs, in the order a seller works through them.
 *
 * `Wallet` sits next to `Earnings` rather than replacing it, because they answer
 * different questions: earnings are *activity* ("how much did I make, and when"), the
 * wallet is *position* ("what is mine, what has left, what can I withdraw right now").
 * The two earnings cards below point at the wallet, because "after the platform fee"
 * is only the first half of that sentence — what the fee leaves, and whether it has
 * been paid out yet, live somewhere else, and making a seller go looking for it is how
 * a platform fee turns into a complaint.
 */
const TABS = [
  { to: "/dashboard", label: "Overview" },
  { to: "/dashboard/products", label: "Listings" },
  { to: "/dashboard/orders", label: "Orders" },
  { to: "/dashboard/rentals", label: "Rentals" },
  { to: "/dashboard/analytics", label: "Analytics" },
  { to: "/dashboard/reviews", label: "Reviews" },
  { to: "/dashboard/earnings", label: "Earnings" },
  { to: "/dashboard/wallet", label: "Wallet" },
  { to: "/dashboard/messages", label: "Messages" },
] as const;

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useSellerSummary();

  const firstName = user?.name.split(" ")[0] ?? "there";

  return (
    <div className="page-wrap space-y-7 pb-10 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your neighbourhood business</p>
          <h1 className="section-title mt-1 text-3xl">Hi {firstName} 👋</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/dashboard/analytics">
              <BarChart3 size={15} aria-hidden />
              Analytics
            </Link>
          </Button>
          <Button asChild>
            <Link to="/dashboard/products/new">
              List an item <ArrowRight size={15} aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      <DashboardTabs />

      {isLoading ? (
        <SummarySkeleton />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-7"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Banknote}
              label="Sale earnings"
              value={formatInr(data?.earnings.saleNetPaise ?? 0)}
              note="After the platform fee"
              to="/dashboard/wallet"
            />
            <StatCard
              icon={Calendar}
              label="Rental earnings"
              value={formatInr(data?.earnings.rentalNetPaise ?? 0)}
              note="After the platform fee"
              to="/dashboard/wallet"
            />
            <StatCard
              icon={Package}
              label="Items with customers"
              value={String(data?.rentals.active ?? 0)}
              note={
                (data?.rentals.overdue ?? 0) > 0
                  ? `${data?.rentals.overdue} overdue`
                  : "Nothing overdue"
              }
              to="/dashboard/rentals"
            />
            <StatCard
              icon={ShoppingBag}
              label="Orders to action"
              value={String((data?.orders.pending ?? 0) + (data?.orders.inProgress ?? 0))}
              note="Waiting on you"
              to="/dashboard/orders"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-heading text-lg font-extrabold">Your listings</h2>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/dashboard/products">
                    Manage <ArrowRight size={14} aria-hidden />
                  </Link>
                </Button>
              </div>

              {/*
                The status split as a proportion bar rather than five separate
                tiles: "6,700 listings" is a single number and five numbers beside
                it is noise. The bar answers the question a seller actually has —
                how much of my catalogue is *live* — at a glance.
              */}
              <ListingBreakdown products={data?.products} />

              <ul className="mt-5 grid gap-2 sm:grid-cols-3">
                <QuickLink
                  to="/dashboard/products/new"
                  icon={PackagePlus}
                  label="List something"
                  hint="Saves as a draft"
                />
                <QuickLink
                  to="/dashboard/orders"
                  icon={ShoppingBag}
                  label="Orders"
                  hint={`${data?.orders.total ?? 0} in total`}
                />
                <QuickLink
                  to="/dashboard/messages"
                  icon={MessageSquare}
                  label="Messages"
                  hint="Buyer questions"
                />
              </ul>
            </Card>

            <div className="space-y-5">
              <Card className="p-6">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} aria-hidden className="text-primary" />
                  <h2 className="font-heading text-lg font-extrabold">Your reputation</h2>
                </div>
                <p className="mt-3 font-heading text-3xl font-black">
                  {(data?.reviews.average ?? 0).toFixed(1)}
                  <Star
                    size={18}
                    aria-hidden
                    className="mb-1 ml-1 inline fill-amber-400 text-amber-400"
                  />
                </p>
                <p className="text-sm text-muted-foreground">
                  {data?.reviews.count ?? 0} review{(data?.reviews.count ?? 0) === 1 ? "" : "s"}
                </p>
                {(data?.reviews.awaitingReply ?? 0) > 0 && (
                  <p className="mt-3 rounded-2xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                    {data?.reviews.awaitingReply} awaiting your reply
                  </p>
                )}
                <Button asChild size="sm" variant="secondary" className="mt-4">
                  <Link to="/dashboard/reviews">Read reviews</Link>
                </Button>
              </Card>

              <Card className="dark-panel p-6 text-primary-foreground">
                <p className="eyebrow text-primary-foreground/60">Tip</p>
                <h2 className="mt-2 font-heading text-lg font-extrabold">
                  Clear photos rent 3× faster
                </h2>
                <p className="mt-1 text-sm text-primary-foreground/75">
                  Natural light, honest angles, and a short description help your neighbours trust
                  the listing.
                </p>
              </Card>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * The tab strip.
 *
 * `useLocation` rather than the global `location`, so it re-renders on a
 * client-side navigation instead of lagging one render behind — and so the
 * dashboard renders at all outside a browser. `isActive` compares
 * `pathname` prefixes because `/dashboard/products/new` should light up the
 * Listings tab, not leave every tab inactive.
 */
function DashboardTabs() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Seller dashboard" className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.to);
        return (
          <Button key={tab.to} asChild size="sm" variant={active ? "default" : "secondary"}>
            <Link to={tab.to} aria-current={active ? "page" : undefined}>
              {tab.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

/** Exact match for `/dashboard`, prefix match for the rest. */
function isActive(pathname: string, to: string): boolean {
  if (to === "/dashboard") return pathname === to || pathname === "/dashboard/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

function ListingBreakdown({
  products,
}: {
  products:
    | {
        total: number;
        active: number;
        draft: number;
        paused: number;
        archived: number;
        outOfStock: number;
      }
    | undefined;
}) {
  if (!products || products.total === 0) {
    return (
      <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        You haven't listed anything yet.
      </p>
    );
  }

  // Segments are declared in one place so the bar and its legend can never
  // disagree about what a colour means. `active` is the headline number, so it
  // leads; the rest explain the other {total − active} listings.
  const segments = [
    { key: "active", label: "Live", value: products.active, className: "bg-primary" },
    {
      key: "outOfStock",
      label: "Out of stock",
      value: products.outOfStock,
      className: "bg-amber-500",
    },
    { key: "paused", label: "Paused", value: products.paused, className: "bg-sky-500" },
    { key: "draft", label: "Draft", value: products.draft, className: "bg-muted-foreground/50" },
    {
      key: "archived",
      label: "Archived",
      value: products.archived,
      className: "bg-border",
    },
  ];

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2">
        <p className="font-heading text-3xl font-black">{products.active}</p>
        <p className="text-sm text-muted-foreground">
          live of {products.total} listing{products.total === 1 ? "" : "s"}
        </p>
      </div>

      <div
        className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={segments
          .filter((segment) => segment.value > 0)
          .map((segment) => `${segment.label}: ${segment.value}`)
          .join(", ")}
      >
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.key}
              className={segment.className}
              style={{ width: `${(segment.value / products.total) * 100}%` }}
            />
          ) : null,
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5 text-xs">
              <span className={`size-2 rounded-full ${segment.className}`} aria-hidden />
              <span className="font-bold">{segment.value}</span>
              <span className="text-muted-foreground">{segment.label}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  hint: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="inset-surface flex items-center gap-3 rounded-2xl p-3 transition hover:bg-primary/10"
      >
        <span className="soft-button flex size-9 items-center justify-center rounded-xl text-primary">
          <Icon size={16} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">{hint}</span>
        </span>
      </Link>
    </li>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  to,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  value: string;
  note: string;
  to: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      <Button asChild size="sm" variant="ghost" className="mt-2 -ml-3">
        <Link to={to}>See details</Link>
      </Button>
    </Card>
  );
}

/** The cards' loading shape — same heights, so nothing jumps when data lands. */
function SummarySkeleton() {
  return (
    <div className="space-y-7" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="size-10 rounded-2xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
          </Card>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="space-y-3 p-6 lg:col-span-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-2.5 w-full rounded-full" />
        </Card>
        <Card className="space-y-3 p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-20" />
        </Card>
      </div>
      <span className="sr-only">Loading your dashboard…</span>
    </div>
  );
}
