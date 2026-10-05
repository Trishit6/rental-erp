import { BadgeIndianRupee, RefreshCcw, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Link } from "@tanstack/react-router";
import { AdminPageHeader } from "../components/AdminLayout";
import { formatAdminMoney } from "../components/format";
import { useAdminFinance } from "../query";

/**
 * `/admin/finance` — where the money went.
 *
 * ## Every figure here is computed by the database, not stored
 *
 * `getAdminFinanceSummary` runs `SUM`/`CASE` aggregates over `orders`,
 * `wallet_transactions` and `payouts` on every request. That is deliberate: a stored
 * "revenue" column is a snapshot that goes stale the moment a refund lands, and a
 * dashboard whose numbers disagree with the ledger is worse than no dashboard.
 *
 * ## Why the figures do not all sum to the same total, and that is correct
 *
 * - **Gross revenue** counts orders that got past `PENDING_PAYMENT`, so an abandoned
 *   checkout is excluded.
 * - **Seller earnings** counts the wallet's `SALE`/`RENTAL` credits with reversals
 *   excluded — so it is what sellers were actually credited.
 * - **Platform earnings** is the magnitude of the `PLATFORM_FEE` rows. Fees are stored
 *   negative (they leave the seller's balance), so the summary takes the absolute value
 *   rather than reporting a negative platform revenue.
 * - **Refunds** are the refund-shaped ledger rows.
 *
 * The gap between gross revenue and seller earnings is the fee plus anything still
 * pending payout, which is why these are four separate figures and not one number with
 * a "minus fees" line. Presenting a single reconciled number that does not reconcile is
 * how a finance screen starts lying.
 */

export function AdminFinancePage() {
  const finance = useAdminFinance();
  const summary = finance.data;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Finance"
        title="Finance"
        description="Live totals computed from orders, the wallet ledger and the payout queue on every load."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={() => void finance.refetch()}>
            <RefreshCcw size={14} aria-hidden />
            Refresh
          </Button>
        }
      />

      {finance.isLoading && !summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="space-y-3 p-4" aria-busy="true">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : finance.isError ? (
        <Card className="p-4">
          <EmptyState
            icon={BadgeIndianRupee}
            title="Unable to load finance"
            description="We couldn't reach the server for these totals. Please try again."
            action={
              <Button type="button" onClick={() => void finance.refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FinanceCard
              icon={BadgeIndianRupee}
              label="Gross revenue"
              value={formatAdminMoney(summary.grossRevenue, summary.currency)}
              note="Every order past payment, including cancelled orders' paid amounts."
            />
            <FinanceCard
              icon={Wallet}
              label="Seller earnings"
              value={formatAdminMoney(summary.sellerEarnings, summary.currency)}
              note="Wallet credits actually given to sellers, reversals excluded."
            />
            <FinanceCard
              icon={TrendingUp}
              label="Platform earnings"
              value={formatAdminMoney(summary.platformEarnings, summary.currency)}
              note="The platform's fee take. Fees are stored negative; this is the magnitude."
            />
            <FinanceCard
              icon={RefreshCcw}
              label="Refunds"
              value={formatAdminMoney(summary.refunds, summary.currency)}
              note="Refund-shaped ledger rows still reflected in the books."
            />
            <FinanceCard
              icon={Wallet}
              label="Payouts pending"
              value={formatAdminMoney(summary.pendingPayouts, summary.currency)}
              note="Requested or processing. Not yet with sellers."
            />
            <FinanceCard
              icon={BadgeIndianRupee}
              label="Payouts completed"
              value={formatAdminMoney(summary.completedPayouts, summary.currency)}
              note="Settled to sellers."
            />
          </div>

          <Card className="p-4">
            <h2 className="text-sm font-bold">Where these numbers come from</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Each figure is an aggregate over the tables that own the truth, so none of them is a
              stored counter. The per-transaction detail is in{" "}
              <Link to="/admin/payments" className="font-semibold text-primary underline-offset-4 hover:underline">
                payments
              </Link>
              , and refunds specifically in{" "}
              <Link to="/admin/refunds" className="font-semibold text-primary underline-offset-4 hover:underline">
                refunds
              </Link>
              .
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function FinanceCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="space-y-1.5 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon size={14} aria-hidden />
        {label}
      </p>
      {/* `tabular-nums` because these are amounts meant to be compared down a column. */}
      <p className="text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </Card>
  );
}
