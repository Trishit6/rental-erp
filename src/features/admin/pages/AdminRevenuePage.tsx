import { AlertTriangle, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPageHeader } from "../components/AdminLayout";
import {
  AdminTable,
  AdminTableHead,
  TableBody,
  TableCell,
  TableRow,
} from "../components/AdminTableScaffold";
import { formatAdminCount, formatAdminMoney, humanizeEnum } from "../components/format";
import { useAdminReconciliation, useAdminRevenue } from "../query";

/**
 * `/admin/revenue` — commission, platform revenue and reconciliation (PROMPT 28).
 *
 * ## Three questions, one page
 *
 *  - **Where does the money come from?** Commission by vendor and by category, read
 *    back from the seller ledger so it can never disagree with a seller's own wallet.
 *  - **What did the platform keep?** The revenue report, with refunds beside the
 *    commission rather than folded into a single "profit" that would be a fiction.
 *  - **Does it all add up?** The reconciliation view, which compares settled orders,
 *    captured payments and completed payouts and lists what does not match.
 *
 * ## Why reconciliation is not a chart
 *
 * A mismatch is not a trend to be watched, it is a task. Flagged rows link to the
 * entity they concern, each carries a one-line explanation, and the totals are stated
 * so an operator can see the size of the problem before working through it.
 */
const SEVERITY_BADGE: Record<string, string> = {
  HIGH: "bg-destructive/12 text-destructive",
  MEDIUM: "bg-warning/15 text-warning",
};

export function AdminRevenuePage() {
  const revenue = useAdminRevenue();
  const reconciliation = useAdminReconciliation();

  const report = revenue.data;
  const recon = reconciliation.data;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Finance"
        title="Revenue & reconciliation"
        description="Commission by vendor and category, the platform revenue report, and a reconciliation of settled orders against captured payments and completed payouts."
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void revenue.refetch();
              void reconciliation.refetch();
            }}
            disabled={revenue.isFetching || reconciliation.isFetching}
          >
            {revenue.isFetching || reconciliation.isFetching ? (
              <Loader2 size={14} aria-hidden className="animate-spin" />
            ) : (
              <RefreshCw size={14} aria-hidden />
            )}
            Refresh
          </Button>
        }
      />

      {/* ------------------------------ revenue ---------------------------------- */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
          <TrendingUp size={15} aria-hidden /> Platform revenue
        </h2>
        {revenue.isLoading && !report ? (
          <Skeleton className="h-28 w-full" />
        ) : revenue.isError || !report ? (
          <Card className="p-4 text-sm text-destructive" role="alert">
            The revenue report could not be loaded.
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat
                label="Gross collected"
                value={formatAdminMoney(report.revenue.grossCollected, report.revenue.currency)}
                hint="What customers paid on settled orders"
              />
              <Stat
                label="Commission"
                value={formatAdminMoney(report.revenue.commission, report.revenue.currency)}
                hint="Platform fees charged to sellers"
              />
              <Stat
                label="Seller earnings"
                value={formatAdminMoney(report.revenue.sellerEarnings, report.revenue.currency)}
                hint="Credited for sales and rentals"
              />
              <Stat
                label="Refunded"
                value={formatAdminMoney(report.revenue.refunded, report.revenue.currency)}
                hint="Actually returned to customers"
              />
              <Stat
                label="Net after refunds"
                value={formatAdminMoney(
                  report.revenue.netRevenueAfterRefunds,
                  report.revenue.currency,
                )}
                hint="Commission less everything returned"
                tone={report.revenue.netRevenueAfterRefunds < 0 ? "danger" : undefined}
              />
            </div>

            {report.revenue.byMonth.length > 0 ? (
              <Card className="overflow-hidden p-0">
                <AdminTable>
                  <AdminTableHead labels={["Month", "Orders", "Gross", "Commission", ""]} />
                  <TableBody>
                    {report.revenue.byMonth.map((month) => (
                      <TableRow key={month.month}>
                        <TableCell className="whitespace-nowrap font-semibold">
                          {month.month}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatAdminCount(month.orders)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatAdminMoney(month.gross, report.revenue.currency)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatAdminMoney(month.commission, report.revenue.currency)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                  </TableBody>
                </AdminTable>
              </Card>
            ) : null}
          </>
        )}
      </section>

      {/* ----------------------------- commission -------------------------------- */}
      {report ? (
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
              Commission by vendor
            </h2>
            <Card className="overflow-hidden p-0">
              {report.commission.byVendor.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No commission has been charged yet.
                </p>
              ) : (
                <AdminTable>
                  <AdminTableHead labels={["Seller", "Sales", "Commission"]} />
                  <TableBody>
                    {report.commission.byVendor.slice(0, 25).map((vendor) => (
                      <TableRow key={vendor.sellerId}>
                        <TableCell className="max-w-56 truncate font-semibold">
                          {vendor.sellerName}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatAdminMoney(vendor.sales, report.commission.currency)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatAdminMoney(vendor.commission, report.commission.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </AdminTable>
              )}
            </Card>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
              Commission by category
            </h2>
            <Card className="overflow-hidden p-0">
              {report.commission.byCategory.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No category-attributed commission yet.
                </p>
              ) : (
                <AdminTable>
                  <AdminTableHead labels={["Category", "Sales", "Commission"]} />
                  <TableBody>
                    {report.commission.byCategory.slice(0, 25).map((category) => (
                      <TableRow key={category.categoryId}>
                        <TableCell className="max-w-56 truncate font-semibold">
                          {category.categoryName}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatAdminMoney(category.sales, report.commission.currency)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatAdminMoney(category.commission, report.commission.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </AdminTable>
              )}
            </Card>
          </div>
        </section>
      ) : null}

      {/* --------------------------- reconciliation ------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
          Reconciliation
        </h2>
        {reconciliation.isLoading && !recon ? (
          <Skeleton className="h-24 w-full" />
        ) : reconciliation.isError || !recon ? (
          <Card className="p-4 text-sm text-destructive" role="alert">
            Reconciliation could not be loaded.
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Settled orders"
                value={formatAdminMoney(recon.totals.ordersCollected, recon.currency)}
              />
              <Stat
                label="Captured payments"
                value={formatAdminMoney(recon.totals.capturedPayments, recon.currency)}
              />
              <Stat
                label="Refunded"
                value={formatAdminMoney(recon.totals.refunded, recon.currency)}
              />
              <Stat
                label="Completed payouts"
                value={formatAdminMoney(recon.totals.completedPayouts, recon.currency)}
              />
            </div>

            {recon.mismatches.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground">
                Everything reconciles — settled orders, captured payments and completed
                payouts agree, with no orphaned or over-refunded rows.
              </Card>
            ) : (
              <Card className="overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-[var(--divider)] px-4 py-2.5 text-sm">
                  <AlertTriangle size={15} aria-hidden className="text-warning" />
                  <span className="font-semibold">
                    {recon.mismatches.length} mismatch
                    {recon.mismatches.length === 1 ? "" : "es"} need attention
                  </span>
                </div>
                <ul className="divide-y divide-[var(--divider)]">
                  {recon.mismatches.map((mismatch, index) => (
                    <li
                      key={`${mismatch.kind}-${mismatch.entityId ?? index}`}
                      className="flex flex-wrap items-start gap-2 px-4 py-3 text-sm"
                    >
                      <Badge
                        className={`whitespace-nowrap ${
                          SEVERITY_BADGE[mismatch.severity] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {humanizeEnum(mismatch.kind)}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p>{mismatch.detail}</p>
                        {mismatch.reference ? (
                          <p className="text-xs text-muted-foreground">{mismatch.reference}</p>
                        ) : null}
                      </div>
                      {mismatch.amount !== null ? (
                        <span className="whitespace-nowrap font-semibold tabular-nums">
                          {formatAdminMoney(mismatch.amount, recon.currency)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <Card className="p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-extrabold tabular-nums ${
          tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
