import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { BarChart3, CalendarRange, Star, TrendingUp } from "lucide-react";
import { ProductImage } from "@/components/shared/product-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInr } from "@/lib/pricing";
import { BarChart, SplitBarChart } from "./components/Charts";
import { canApplyCustomRange } from "./components/schema";
import { useSellerAnalytics } from "./query";
import {
  ANALYTICS_PERIODS,
  METRIC_LABELS,
  PERIOD_LABELS,
  TOP_PRODUCT_METRICS,
  type AnalyticsParams,
  type TopProductMetric,
} from "./types";

/**
 * Seller analytics — `/dashboard/analytics`.
 *
 * ## The window is chosen by the server, not the browser
 *
 * `?period=30d` means "the last thirty days" **as of this request**, resolved in
 * `server/lib/seller-analytics.ts`. That sounds obvious and is worth stating,
 * because the alternative — shipping the seller's own orders to the browser and
 * slicing them there — is both slower and wrong the moment the seller opens a
 * bookmark from last month and reads it as this month.
 *
 * The custom range is capped at two years server-side. An unbounded date range
 * over the orders table is a table scan anyone can ask for by editing a query
 * string, so the cap is an authorization-adjacent control, not a UX choice.
 *
 * ## Empty periods are shown as zero, not omitted
 *
 * The server zero-fills the series. A chart that drew a line straight from the
 * 3rd to the 9th of the month would be asserting revenue on the days in between;
 * a bar of height zero is a bar the seller can see is a zero.
 */
export function SellerAnalyticsPage({
  params,
  onParamsChange,
}: {
  /** Parsed from the URL by `route.tsx`, so a window is shareable. */
  params: AnalyticsParams;
  onParamsChange: (next: AnalyticsParams) => void;
}) {
  const { data, isLoading, isFetching } = useSellerAnalytics(params);
  // Memoised so a re-render while `data` is still undefined does not hand the
  // chart memos a fresh `[]` every time.
  const series = useMemo(() => data?.series ?? [], [data]);

  // The ranking metric travels in the URL like the window does, so a shared link
  // renders the same ranking it was made with.
  const metric = params.metric;
  const setMetric = (next: TopProductMetric) => onParamsChange({ ...params, metric: next });

  const daily = useMemo(
    () =>
      series.map((point) => ({
        label: shortDate(point.date),
        // The two sources are added here, and only here, because the server sends
        // them apart on purpose — see `AnalyticsSeriesPoint`.
        value: point.purchaseRevenuePaise + point.rentalRevenuePaise,
      })),
    [series],
  );

  const split = useMemo(
    () =>
      series.map((point) => ({
        label: shortDate(point.date),
        left: point.purchaseRevenuePaise,
        right: point.rentalRevenuePaise,
      })),
    [series],
  );

  return (
    <div className="page-wrap space-y-6 pb-10 pt-8">
      <header>
        <p className="eyebrow">How your shop is doing</p>
        <h1 className="section-title mt-1 text-3xl sm:text-4xl">Analytics</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Revenue, orders and your best-performing listings. Everything below is calculated from
          your own orders — nothing is estimated.
        </p>
      </header>

      <Card className="space-y-4 p-5">
        <PeriodPicker params={params} onChange={onParamsChange} />
      </Card>

      {isLoading ? (
        <AnalyticsSkeleton />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`space-y-6 ${isFetching ? "opacity-60" : ""}`}
          aria-busy={isFetching}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={TrendingUp}
              label="Earnings in period"
              value={formatInr(data?.totals.revenuePaise ?? 0)}
              note={`${formatInr(data?.totals.purchaseRevenuePaise ?? 0)} sales · ${formatInr(data?.totals.rentalRevenuePaise ?? 0)} rentals`}
            />
            <MetricCard
              icon={BarChart3}
              label="Orders"
              value={String(data?.totals.orders ?? 0)}
              note={`${data?.totals.purchaseOrders ?? 0} purchases · ${data?.totals.rentalBookings ?? 0} bookings`}
            />
            <MetricCard
              icon={CalendarRange}
              label="Units moved"
              value={String((data?.totals.unitsSold ?? 0) + (data?.totals.unitsRented ?? 0))}
              note={`${data?.totals.unitsSold ?? 0} sold · ${data?.totals.unitsRented ?? 0} rented`}
            />
            <MetricCard
              icon={Star}
              label="Average rating"
              value={(data?.totals.averageRating ?? 0).toFixed(1)}
              note={`${data?.totals.ratingCount ?? 0} review${(data?.totals.ratingCount ?? 0) === 1 ? "" : "s"}`}
            />
          </div>

          <Card className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-lg font-extrabold">Earnings over time</h2>
              {data?.range && (
                <p className="text-xs text-muted-foreground">
                  {data.range.from.slice(0, 10)} → {data.range.to.slice(0, 10)}
                </p>
              )}
            </div>
            <BarChart
              data={daily}
              formatValue={formatInr}
              label="Earnings per period"
              emptyMessage="No earnings in this period. Try a wider window."
            />
          </Card>

          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-heading text-lg font-extrabold">Sales against rentals</h2>
            <SplitBarChart
              data={split}
              formatValue={formatInr}
              leftLabel="Sales"
              rightLabel="Rentals"
            />
            <p className="text-xs text-muted-foreground">
              Sales and rentals, bucket by bucket, from the same records as the chart above — so the
              two always add up to the same earnings figure.
            </p>
          </Card>

          <TopProductsSection params={params} metric={metric} onMetric={setMetric} />
        </motion.div>
      )}
    </div>
  );
}

/**
 * Period selection.
 *
 * The custom range is committed with an explicit **Apply** rather than on every
 * keystroke, and that is the whole reason the draft is local state. A date input
 * fires `change` for every segment the seller edits — picking "March" from the
 * month list emits an intermediate `2026-03-01` — so an on-change submit would
 * fire a query for a range nobody asked for and briefly render an analytics page
 * about a single day. One button, one request.
 *
 * The fields are only mounted once "Custom range" is chosen, so a fixed window can
 * never be contaminated by a half-typed date left over from a previous visit.
 */
function PeriodPicker({
  params,
  onChange,
}: {
  params: AnalyticsParams;
  onChange: (next: AnalyticsParams) => void;
}) {
  const [draft, setDraft] = useState({ from: params.from ?? "", to: params.to ?? "" });

  // Re-seed when the applied range changes from elsewhere — the URL Back button,
  // or the seller switching to another fixed window and back.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = `${params.from ?? ""}/${params.to ?? ""}`;
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    setDraft({ from: params.from ?? "", to: params.to ?? "" });
  }

  const ready = canApplyCustomRange(draft.from, draft.to);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Time period">
        {ANALYTICS_PERIODS.filter((option) => option !== "custom").map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={params.period === option}
            onClick={() => onChange({ period: option, metric: params.metric })}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              params.period === option ? "primary-button text-primary-foreground" : "inset-surface"
            }`}
          >
            {PERIOD_LABELS[option]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={params.period === "custom"}
          onClick={() =>
            onChange({ period: "custom", metric: params.metric, from: draft.from, to: draft.to })
          }
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${
            params.period === "custom" ? "primary-button text-primary-foreground" : "inset-surface"
          }`}
        >
          {PERIOD_LABELS.custom}
        </button>
      </div>

      {params.period === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-bold">From</span>
            <Input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-bold">To</span>
            <Input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={!ready}
            onClick={() =>
              onChange({ period: "custom", metric: params.metric, from: draft.from, to: draft.to })
            }
          >
            Apply range
          </Button>
          <p className="text-xs text-muted-foreground">
            Ranges are capped at two years by the server.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The ranked listings table.
 *
 * `metric` is hoisted to the page, but the *ranking itself* is not shared: the
 * server re-ranks on every request and sends only the top eight, so changing the
 * metric re-requests rather than re-sorting the eight rows on screen. That is
 * deliberate — re-sorting client-side would have to reimplement the server's
 * tiebreak, and the two would disagree about which of two equally-rated listings
 * is "best".
 */
function TopProductsSection({
  params,
  metric,
  onMetric,
}: {
  params: AnalyticsParams;
  metric: TopProductMetric;
  onMetric: (metric: TopProductMetric) => void;
}) {
  const { data, isLoading } = useSellerAnalytics(params);
  const rows = data?.topProducts ?? [];

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-extrabold">Your top listings</h2>
        <div className="flex gap-2" role="group" aria-label="Rank listings by">
          {TOP_PRODUCT_METRICS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={metric === option}
              onClick={() => onMetric(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                metric === option ? "primary-button text-primary-foreground" : "inset-surface"
              }`}
            >
              {METRIC_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sales in this period yet. Once something sells, it'll be ranked here.
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {rows.map((product) => (
            <li key={product.id} className="flex items-center gap-3 py-3">
              <ProductImage
                src={product.primaryImage}
                alt=""
                className="size-12 shrink-0 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <Link
                  to="/product/$slug"
                  params={{ slug: product.slug }}
                  className="block truncate text-sm font-bold hover:text-primary"
                >
                  {product.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {product.unitsSold} sold · {product.unitsRented} rented
                  {product.ratingCount > 0 && ` · ${product.ratingAverage.toFixed(1)}★`}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold">{formatInr(product.revenuePaise)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="p-5">
      <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
        <Icon size={18} />
      </span>
      <p className="mt-3 text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-black">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="size-10 rounded-2xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-24" />
          </Card>
        ))}
      </div>
      <Card className="space-y-4 p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-40 w-full" />
      </Card>
      <span className="sr-only">Loading analytics…</span>
    </div>
  );
}

/** `2026-03-04` → `4 Mar`. The bucket may be a month, so the day is dropped then. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
