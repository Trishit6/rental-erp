import { useMemo } from "react";
import { formatInr } from "@/lib/pricing";
import { Card } from "@/components/ui/card";
import { walletTypeLabel } from "./labels";
import type { WalletBreakdownRow, WalletSeriesPoint } from "../types";

/**
 * Earnings over time.
 *
 * ## Why this draws bars from a plain table rather than a chart library
 *
 * The interesting part of a wallet is the *gap* between the two series: sales and
 * rentals earned, against fees and payouts taken. A stacked area of one blended
 * number cannot show that — it would draw "money in" going up while the balance goes
 * down, and the reader has to work out why.
 *
 * So the primary series is a single column chart of **net money moved per day**, with
 * a table beneath it that keeps every component separate. The table is not a fallback
 * for the chart: it is the only place the split is visible, and it is what makes the
 * chart honest.
 *
 * ## Two representations, one set of numbers
 *
 * The chart is scaled by the largest magnitude in the series rather than by the sum,
 * so a day with one large sale and one large payout does not compress everything else
 * to nothing. Zero days are drawn at zero height rather than skipped — a missing day
 * on a chart is indistinguishable from a rendering failure.
 */

/** One stacked column: what came in above the axis, what went out below it. */
type DailyBar = {
  date: string;
  /** Sales + rentals, gross of fees. */
  earned: number;
  /** Fees, refunds and payouts, as a magnitude. */
  out: number;
  sale: number;
  rental: number;
  fee: number;
  refund: number;
  payout: number;
};

function toBars(series: WalletSeriesPoint[]): DailyBar[] {
  return series.map((point) => ({
    date: point.date,
    earned: point.salePaise + point.rentalPaise,
    out: point.feePaise + point.refundPaise + point.payoutPaise,
    sale: point.salePaise,
    rental: point.rentalPaise,
    fee: point.feePaise,
    refund: point.refundPaise,
    payout: point.payoutPaise,
  }));
}

/** `2026-09-14` → `14 Sep`, and `2026-09-01` → `Sep`. Month buckets need no day. */
function bucketLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number) as [number, number, number];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return day === 1 ? months[month - 1] : `${day} ${months[month - 1]}`;
}

export function WalletEarningsChart({
  series,
  bucket,
  loading = false,
}: {
  series: WalletSeriesPoint[];
  bucket: "day" | "month";
  loading?: boolean;
}) {
  const bars = useMemo(() => toBars(series), [series]);

  if (loading && bars.length === 0) {
    return (
      <Card className="p-6" aria-busy="true">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-5 h-40 animate-pulse rounded-2xl bg-muted" />
      </Card>
    );
  }

  if (bars.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="font-heading text-lg font-extrabold">Money in and out</h2>
        <p className="mt-3 rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing recorded in this window yet.
        </p>
      </Card>
    );
  }

  const peak = Math.max(1, ...bars.map((bar) => Math.max(bar.earned, bar.out)));

  const active = bars.filter((bar) => bar.earned > 0 || bar.out > 0);

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-extrabold">Money in and out</h2>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Legend className="bg-primary" label="Sales & rentals" />
          <Legend className="bg-destructive/60" label="Fees, refunds & payouts" />
        </ul>
      </div>

      {/*
        Bars rather than an SVG line chart: the comparison being asked is
        "which day moved more money, and in which direction", and a column above or
        below an axis answers that without a tooltip or a hover hit-area — which is
        what makes it work on a phone.
      */}
      <div
        className="flex h-44 items-end gap-[3px]"
        role="img"
        aria-label={describeSeries(bars, bucket)}
      >
        {bars.map((bar) => {
          const up = (bar.earned / peak) * 100;
          const down = (bar.out / peak) * 100;
          return (
            <div key={bar.date} className="flex h-full flex-1 flex-col justify-center gap-[2px]">
              {/* Money in, growing upward from the middle. */}
              <div className="flex h-1/2 items-end">
                {up > 0 && (
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{ height: `${Math.max(up, 2)}%` }}
                  />
                )}
              </div>
              {/* Money out, growing downward. */}
              <div className="flex h-1/2 items-start">
                {down > 0 && (
                  <div
                    className="w-full rounded-b bg-destructive/60"
                    style={{ height: `${Math.max(down, 2)}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Only a handful of labels: one per column is unreadable and one per row is noise. */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{bars.length > 0 ? bucketLabel(bars[0].date) : ""}</span>
        <span>{bars.length > 1 ? bucketLabel(bars[Math.floor(bars.length / 2)].date) : ""}</span>
        <span>{bars.length > 1 ? bucketLabel(bars[bars.length - 1].date) : ""}</span>
      </div>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing moved in this window. That is a real answer, not an empty chart — the days with no
          activity are drawn at zero rather than skipped.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Money in and out by {bucket}, with sales and rentals kept apart from fees, refunds and
              payouts
            </caption>
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                <th scope="col" className="px-2 py-2">
                  {bucket === "month" ? "Month" : "Date"}
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Sales
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Rentals
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Fees
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Refunds
                </th>
                <th scope="col" className="px-2 py-2 text-right">
                  Payouts
                </th>
              </tr>
            </thead>
            <tbody>
              {active.slice(-12).map((bar) => (
                <tr key={bar.date} className="border-b border-border/40 last:border-0">
                  <td className="px-2 py-2 font-mono text-xs">{bar.date}</td>
                  <td className="px-2 py-2 text-right">{formatInr(bar.sale)}</td>
                  <td className="px-2 py-2 text-right">{formatInr(bar.rental)}</td>
                  <td className="px-2 py-2 text-right text-muted-foreground">
                    {formatInr(-bar.fee)}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">
                    {formatInr(-bar.refund)}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">
                    {formatInr(-bar.payout)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${className}`} aria-hidden />
      {label}
    </li>
  );
}

/**
 * The chart's text alternative.
 *
 * Not "a chart showing earnings" — the actual range and the largest movers, because a
 * screen-reader user is owed the same answer a sighted one gets, and "chart" alone
 * tells them nothing at all.
 */
function describeSeries(bars: DailyBar[], bucket: "day" | "month"): string {
  const busiest = bars.reduce<DailyBar | null>(
    (best, bar) => (!best || bar.earned > best.earned ? bar : best),
    null,
  );
  const totalEarned = bars.reduce((sum, bar) => sum + bar.earned, 0);
  const totalOut = bars.reduce((sum, bar) => sum + bar.out, 0);

  const busiestPart =
    busiest && busiest.earned > 0
      ? ` The busiest ${bucket} was ${busiest.date} with ${formatInr(busiest.earned)}.`
      : "";

  return (
    `Money in and out by ${bucket}: ${formatInr(totalEarned)} earned and ` +
    `${formatInr(totalOut)} in fees, refunds and payouts.${busiestPart}`
  );
}

/**
 * The per-type totals for the selected window.
 *
 * Counts **and** amounts, because "4 sales" alone does not answer whether they were
 * good weeks; and a row is shown only when it has a row to show, so the strip is
 * silent about activity that did not happen rather than listing zeroes for every
 * possible type.
 */
export function WalletTypeBreakdown({ rows }: { rows: WalletBreakdownRow[] }) {
  const present = rows.filter((row) => row.count > 0);
  if (present.length === 0) return null;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {present.map((row) => (
        <li
          key={row.type}
          className="inset-surface flex items-baseline justify-between gap-3 rounded-2xl px-4 py-3"
        >
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-muted-foreground">
              {walletTypeLabel(row.type)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {row.count} {row.count === 1 ? "entry" : "entries"}
            </span>
          </span>
          <span className="font-heading text-base font-black">{formatInr(row.amountPaise)}</span>
        </li>
      ))}
    </ul>
  );
}
