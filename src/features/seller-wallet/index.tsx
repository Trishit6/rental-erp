import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletFilters } from "./components/WalletFilters";
import { WalletBalanceCards, WalletLifetimeStrip } from "./components/WalletOverview";
import { WalletEarningsChart, WalletTypeBreakdown } from "./components/WalletEarningsChart";
import { WalletLedgerHeading, WalletTransactionList } from "./components/WalletTransactionList";
import { WalletPayoutRequestForm } from "./components/WalletPayoutRequestForm";
import { WalletPayoutHistory } from "./components/WalletPayoutHistory";
import { WalletPayoutDetails } from "./components/WalletPayoutDetails";
import { useWalletOverview, useWalletPayouts, useWalletTransactions } from "./query";
import type { WalletParams } from "./types";

/**
 * The seller wallet — `/dashboard/wallet`.
 *
 * ## One page, one source of numbers
 *
 * Every figure on screen came out of `GET /api/seller/wallet/overview` or
 * `…/transactions`, and both were `SUM`s in MariaDB. This file does no arithmetic on
 * money: it arranges server answers and hands the user back to the server on a
 * change. That is not tidiness — a browser-computed balance is a *second* balance,
 * and the two disagree the moment a payout moves between buckets, which is exactly
 * when a seller has the page open.
 *
 * ## Two requests, not one
 *
 * The ledger is paginated and the chart is not, so they cannot share a response
 * without either sending the whole history or paginating the chart. They share a
 * *window* instead — the same `params` object, so the filter chips, the chart and the
 * list can never be describing different periods. The single exception is the payout
 * list, which is filtered only by the window: a payout is a small, bounded set and
 * paginating it would add a control for no benefit.
 *
 * ## The window is in the URL, resolved by the server
 *
 * `?range=30d` means "the last thirty days **as of this request, in the browser's own
 * timezone**", cut in `server/lib/wallet.ts`. The chips and the chart's x-axis
 * therefore come from one response's `range` block, so there is no path where the
 * filter says "last 7 days" and the chart drew the last 30.
 */
export function SellerWalletPage({
  params,
  onParamsChange,
}: {
  params: WalletParams;
  onParamsChange: (next: WalletParams) => void;
}) {
  const overview = useWalletOverview(params);
  const ledger = useWalletTransactions(params);
  const payouts = useWalletPayouts(params);
  const [openPayout, setOpenPayout] = useState<string | null>(null);

  const balance = overview.data?.balance;
  const limits = overview.data?.limits;

  /**
   * Outstanding requests, for the form's reminder.
   *
   * Filtered from what the server already sent rather than fetched a second time. The
   * two statuses listed are the ones the server's `reservedPaise` `SUM` counts, so the
   * form nags about exactly the requests that are holding money — and never about one
   * that has already come back.
   */
  const pendingPayouts = (payouts.data ?? []).filter(
    (payout) => payout.status === "PENDING" || payout.status === "PROCESSING",
  );

  return (
    <div className="page-wrap space-y-6 pb-10 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your money</p>
          <h1 className="section-title mt-1 text-3xl sm:text-4xl">Wallet</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            What you have earned, what the platform has kept, and what has left your account.
            Security deposits are held separately and never counted as earnings.
          </p>
        </div>
        {overview.data?.range && (
          <p className="text-xs text-muted-foreground">
            {overview.data.range.from.slice(0, 10)} → {overview.data.range.to.slice(0, 10)}
            {overview.data.range.timezoneOffsetMinutes !== 0 && (
              <> · your timezone (UTC{formatOffset(overview.data.range.timezoneOffsetMinutes)})</>
            )}
          </p>
        )}
      </header>

      <WalletBalanceCards
        balance={balance}
        loading={overview.isLoading}
        settlementDelayDays={limits?.settlementDelayDays ?? 0}
      />

      <WalletLifetimeStrip balance={balance} />

      <Card className="space-y-4 p-5">
        <WalletFilters params={params} onChange={onParamsChange} />
      </Card>

      {overview.isLoading ? (
        <ChartSkeleton />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`space-y-6 ${overview.isFetching ? "opacity-60" : ""}`}
          aria-busy={overview.isFetching}
        >
          <WalletEarningsChart
            series={overview.data?.series ?? []}
            bucket={overview.data?.range.bucket ?? "day"}
            loading={overview.isFetching}
          />

          <WalletTypeBreakdown rows={overview.data?.breakdown ?? []} />
        </motion.div>
      )}

      <section className="space-y-4">
        <div className="space-y-1">
          <WalletLedgerHeading total={ledger.data?.pagination.total ?? 0} />
          <p className="text-sm text-muted-foreground">
            Sales, rentals, fees, refunds and payouts — in the order they happened.
          </p>
        </div>

        <WalletTransactionList
          rows={ledger.data?.rows ?? []}
          filter={params.filter}
          pagination={ledger.data?.pagination ?? { page: params.page, totalPages: 1, total: 0 }}
          search={params.search}
          onSearchChange={(value) => onParamsChange({ ...params, search: value, page: 1 })}
          onPageChange={(page) => onParamsChange({ ...params, page })}
          loading={ledger.isLoading}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <WalletPayoutRequestForm
          balance={balance}
          minimumPayoutPaise={limits?.minimumPayoutPaise ?? 0}
          pendingPayouts={pendingPayouts}
        />

        <WalletPayoutHistory
          payouts={payouts.data ?? []}
          loading={payouts.isLoading}
          onSelect={setOpenPayout}
        />
      </div>

      <WalletPayoutDetails payoutNumber={openPayout} onClose={() => setOpenPayout(null)} />
    </div>
  );
}

/** `330` → `+05:30`. Shown only when the browser is not on UTC. */
function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const rest = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${rest}`;
}

function ChartSkeleton() {
  return (
    <Card className="space-y-4 p-6" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-40 w-full" />
      <span className="sr-only">Loading your earnings…</span>
    </Card>
  );
}
