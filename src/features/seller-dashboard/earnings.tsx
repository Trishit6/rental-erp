import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Banknote, Info, Wallet } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useSellerEarnings, useSellerTransactions } from "./query";

/**
 * Seller earnings — `/dashboard/earnings`.
 *
 * ## Gross and net are both shown, and the fee is stated
 *
 * The endpoint sends `saleNet` / `rentalNet` alongside the gross figures, so the
 * browser never multiplies by a fee percentage it was handed — the subtraction
 * happens once, server-side, where the fee comes from `PLATFORM_*_FEE_PERCENT`.
 * (It used to send `saleFeePercent: 5` and `rentalFeePercent: 10` as literals
 * while the server read the real values from the environment: two numbers that
 * could disagree about how much a seller keeps, one of them sent to the browser as
 * though it were authoritative.)
 *
 * Showing both is the honest presentation — "you earned ₹48,200, we kept ₹2,410"
 * is a statement the seller can check, and a page that only shows the net invites
 * the question anyway.
 *
 * ## Order references are `orderNumber`
 *
 * The auto-increment id is a row count. Printing it tells a seller how much
 * business every other seller in the marketplace has done, which is precisely
 * what `orderNumber` exists to prevent on the customer side.
 */
export function DashboardEarningsPage() {
  const { data: earnings, isLoading } = useSellerEarnings();
  const { data: transactions } = useSellerTransactions();
  const [showGross, setShowGross] = useState(false);

  const sale = showGross ? earnings?.saleEarnings : earnings?.saleNet;
  const rental = showGross ? earnings?.rentalEarnings : earnings?.rentalNet;

  return (
    <div className="page-wrap space-y-7 pb-10 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Your money</p>
          <h1 className="section-title mt-1 text-3xl sm:text-4xl">Earnings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Lifetime totals from your own sales and rentals, with the platform fee already taken out
            unless you ask to see it.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link to="/dashboard/analytics">See trends</Link>
        </Button>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index} className="space-y-3 p-5">
              <div className="size-10 animate-pulse rounded-2xl bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-7 w-28 animate-pulse rounded bg-muted" />
            </Card>
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="grid gap-4 sm:grid-cols-3"
        >
          <Card className="p-5">
            <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
              <Banknote size={18} aria-hidden />
            </span>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              {showGross ? "Sale earnings" : "Sale earnings, net"}
            </p>
            <p className="font-heading text-2xl font-black">{formatInr(sale ?? 0)}</p>
            <FeeNote percent={earnings?.saleFeePercent} shown={!showGross} />
          </Card>

          <Card className="p-5">
            <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
              <Wallet size={18} aria-hidden />
            </span>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              {showGross ? "Rental earnings" : "Rental earnings, net"}
            </p>
            <p className="font-heading text-2xl font-black">{formatInr(rental ?? 0)}</p>
            <FeeNote percent={earnings?.rentalFeePercent} shown={!showGross} />
          </Card>

          <Card className="p-5">
            <p className="mt-3 text-xs font-semibold text-muted-foreground">Orders to action</p>
            <p className="mt-7 font-heading text-2xl font-black">
              {earnings?.pendingOrderCount ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Waiting on you to pack, ship or hand over.
            </p>
          </Card>
        </motion.div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setShowGross((value) => !value)}>
          {showGross ? "Show what you keep" : "Show before fees"}
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info size={13} aria-hidden />
          Security deposits are excluded — they are held, not earned.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-extrabold">Transactions</h2>
        {!transactions?.length ? (
          <EmptyState
            icon={Banknote}
            title="No transactions yet"
            description="Payments, refunds and payouts will appear here."
          />
        ) : (
          <>
            {/* Table on desktop, cards on mobile — the same reasoning as the
                listings table: five columns do not fit at 375px, and hiding the
                table entirely would leave a phone seller unable to read anything. */}
            <Card className="hidden overflow-x-auto p-2 sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                    <th scope="col" className="px-3 py-3">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Order
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Amount
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-border/40 last:border-0">
                      <td className="px-3 py-3">
                        {format(new Date(transaction.createdAt), "d MMM yyyy")}
                      </td>
                      <td className="px-3 py-3">{readableType(transaction.type)}</td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {transaction.orderNumber ?? "—"}
                      </td>
                      <td className="px-3 py-3 font-bold">{formatInr(transaction.amount)}</td>
                      <td className="px-3 py-3">
                        <Badge
                          className={
                            transaction.status === "SUCCEEDED" ? "bg-accent/10 text-accent" : ""
                          }
                        >
                          {readableStatus(transaction.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <ul className="space-y-2 sm:hidden">
              {transactions.map((transaction) => (
                <li key={transaction.id} className="inset-surface rounded-2xl p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold">{readableType(transaction.type)}</p>
                    <p className="font-heading text-lg font-black">
                      {formatInr(transaction.amount)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(transaction.createdAt), "d MMM yyyy")}
                    {transaction.orderNumber && ` · ${transaction.orderNumber}`}
                  </p>
                  <Badge
                    className={`mt-2 ${transaction.status === "SUCCEEDED" ? "bg-accent/10 text-accent" : ""}`}
                  >
                    {readableStatus(transaction.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/** "PLATFORM_FEE" → "Platform fee". The stored value is the database vocabulary. */
function readableType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function readableStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

/** States the actual rate, so the net figure above is checkable. */
function FeeNote({ percent, shown }: { percent: number | undefined; shown: boolean }) {
  if (percent === undefined) return null;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      {shown ? `After the ${percent}% platform fee` : `Before the ${percent}% platform fee`}
    </p>
  );
}
