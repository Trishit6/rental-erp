import { format } from "date-fns";
import { Search, Wallet } from "lucide-react";
import { formatInr } from "@/lib/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Input } from "@/components/ui/input";
import {
  earningStatusLabel,
  earningStatusTone,
  emptyLedgerCopy,
  isCredit,
  rowEffect,
  walletTypeBadge,
} from "./labels";
import type { WalletFilter, WalletTransaction } from "../types";

/**
 * The ledger.
 *
 * ## The sign is shown, not hidden behind an absolute value
 *
 * `formatInr(transaction.amount)` — never `Math.abs`. A refund of −₹2,000 rendered as
 * "₹2,000" with a red badge is a much weaker statement than "−₹2,000, money left your
 * wallet", and the whole reason the amount crosses the wire signed is so this row can
 * say which direction it went. `formatInr` handles a negative correctly (`-₹2,000`);
 * stripping the sign is what would need doing, and it is not done.
 *
 * ## Table on desktop, cards on mobile
 *
 * Six columns do not fit at 375px, and hiding the table entirely would leave a phone
 * seller unable to read anything. Same reasoning as the listings page.
 */
export function WalletTransactionList({
  rows,
  filter,
  pagination,
  search,
  onSearchChange,
  onPageChange,
  loading = false,
}: {
  rows: WalletTransaction[];
  filter: WalletFilter;
  pagination: { page: number; totalPages: number; total: number };
  search: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  loading?: boolean;
}) {
  if (!loading && rows.length === 0) {
    const copy = emptyLedgerCopy(filter);
    return (
      <>
        <EmptyState icon={Wallet} title={copy.title} description={copy.description} />
        {/* Pagination stays outside the empty state: an empty *page 4* is a real
            possibility, and hiding the control would leave the seller unable to get
            back to page 1. */}
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={onPageChange}
        />
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-full border border-border px-4">
        <Search size={15} aria-hidden className="shrink-0 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by order or payout reference"
          aria-label="Search your wallet"
          className="h-11 border-0 px-2 focus-visible:ring-0"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {pagination.total} {pagination.total === 1 ? "entry" : "entries"}
        {pagination.totalPages > 1 && ` · page ${pagination.page} of ${pagination.totalPages}`}
      </p>

      <Card className="hidden overflow-x-auto p-2 sm:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Every movement in and out of your wallet</caption>
          <thead>
            <tr className="border-b border-border/60 text-xs uppercase text-muted-foreground">
              <th scope="col" className="px-3 py-3">
                Date
              </th>
              <th scope="col" className="px-3 py-3">
                What
              </th>
              <th scope="col" className="px-3 py-3">
                Reference
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                Amount
              </th>
              <th scope="col" className="px-3 py-3">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-3 whitespace-nowrap">
                  {format(new Date(row.createdAt), "d MMM yyyy")}
                </td>
                <td className="px-3 py-3">
                  <span className="block font-semibold">{walletTypeBadge(row.type)}</span>
                  <span className="block text-xs text-muted-foreground">{row.description}</span>
                </td>
                <td className="px-3 py-3 font-mono text-xs">{row.reference ?? "—"}</td>
                <td
                  className={`px-3 py-3 text-right font-bold ${
                    isCredit(row.amount) ? "" : "text-destructive"
                  }`}
                >
                  {formatInr(row.amount)}
                </td>
                <td className="px-3 py-3">
                  <Badge className={earningStatusTone(row.status)}>
                    {earningStatusLabel(row.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li key={row.id} className="inset-surface rounded-2xl p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold">{walletTypeBadge(row.type)}</p>
              <p
                className={`font-heading text-lg font-black ${
                  isCredit(row.amount) ? "" : "text-destructive"
                }`}
              >
                {formatInr(row.amount)}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {format(new Date(row.createdAt), "d MMM yyyy")}
              {row.reference && ` · ${row.reference}`}
            </p>
            <Badge className={`mt-2 ${earningStatusTone(row.status)}`}>
              {rowEffect(row.type, row.status) === "reversed"
                ? earningStatusLabel("REVERSED")
                : earningStatusLabel(row.status)}
            </Badge>
          </li>
        ))}
      </ul>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}

/**
 * The ledger's own header row of totals.
 *
 * A thin wrapper that exists so `index.tsx` does not reach into the list's internals
 * for a heading, and so a future "select all" row has somewhere to live.
 */
export function WalletLedgerHeading({ total }: { total: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-heading text-lg font-extrabold">Every entry</h2>
      {total > 0 && (
        <Button variant="ghost" size="sm" disabled>
          {total} recorded
        </Button>
      )}
    </div>
  );
}
