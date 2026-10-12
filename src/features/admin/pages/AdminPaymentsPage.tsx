import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { AdminPageHeader } from "../components/AdminLayout";
import {
  AdminTable,
  AdminTableHead,
  AdminTableScaffold,
  TableBody,
  TableCell,
  TableRow,
} from "../components/AdminTableScaffold";
import { AdminTransactionDetailDialog } from "../components/AdminTransactionDetailDialog";
import { formatAdminDateTime, formatAdminMoney, humanizeEnum } from "../components/format";
import { NEUTRAL_BADGE, PAYMENT_STATUS_BADGE } from "../components/status-badge";
import { useAdminSearchFilters, useAdminTransactions } from "../query";
import { EMPTY_ADMIN_TRANSACTION_FILTERS, type AdminTransactionRow } from "../api";

/**
 * `/admin/payments` — the money ledger.
 *
 * ## Read-only, and that is a design decision
 *
 * Every row here is a `transactions` record: a provider's view of money moving. This
 * table is how an administrator confirms what actually happened at the provider; it
 * never *initiates* a refund. A button that marked a transaction REFUNDED would be a
 * lie — the money would not have moved, the provider would not know, and the ledger
 * would disagree with the bank. Refund *requests* and their approval live at
 * `/admin/refunds` (PROMPT 28), and executing one goes through the provider.
 *
 * ## Why the provider id is the searchable field
 *
 * `search` matches `providerTransactionId`, order number and customer email. That is
 * the set an administrator actually has in front of them when reconciling: a bank
 * reference, an order number, or a customer's email. Adding a "search by amount" field
 * would be a filter nobody asked for and a rounding-error trap.
 */

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SUCCEEDED", label: "Succeeded" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REFUNDED", label: "Refunded" },
];

const TYPE_OPTIONS = [
  { value: "", label: "Every type" },
  { value: "PAYMENT", label: "Payments" },
  { value: "REFUND", label: "Refunds" },
  { value: "PAYOUT", label: "Payouts" },
];

/**
 * The provider is named in the table rather than hidden.
 *
 * Development runs the mock provider (`lib/payments/mock-provider.ts`), whose ids look
 * like real ones. Showing the provider column is what lets someone reading this table
 * know which world they are in, and it is why the type filter exists as a `select`
 * rather than being hard-coded.
 */
function ProviderCell({ row }: { row: AdminTransactionRow }) {
  return (
    <div className="max-w-56">
      <p className="truncate text-xs font-semibold">{row.provider}</p>
      <p className="truncate text-xs text-muted-foreground">
        {row.providerTransactionId ?? "no reference"}
        {row.paymentMethod ? ` · ${row.paymentMethod.toLowerCase()}` : ""}
      </p>
    </div>
  );
}

export function AdminPaymentsPage() {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_TRANSACTION_FILTERS);
  const transactions = useAdminTransactions(filters);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = transactions.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" || filters.status !== null || filters.type !== null;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Finance"
        title="Payments"
        description="Payments, refunds and payouts as the provider reported them. Searchable by provider reference, order number or email."
      />

      <AdminTableScaffold
        icon={CreditCard}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={transactions.isFetching && !transactions.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_TRANSACTION_FILTERS })}
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
          {
            key: "type",
            label: "Type",
            value: filters.type ?? "",
            onChange: (value: string) => update({ type: value || null }),
            options: TYPE_OPTIONS,
          },
        ]}
        count={transactions.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={transactions.isLoading && !transactions.data}
        isError={transactions.isError}
        onRetry={() => void transactions.refetch()}
        emptyTitle={hasFilters ? "Nothing matches" : "No transactions yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : "Payments appear here once a customer completes checkout."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={transactions.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={[
              "Reference",
              "Type",
              "Order",
              "Customer",
              "Provider",
              "Amount",
              "Status",
              "When",
              "",
            ]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap font-semibold">#{row.id}</TableCell>
                <TableCell>
                  <Badge className={`whitespace-nowrap ${row.type === "REFUND" ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"}`}>
                    {humanizeEnum(row.type)}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.orderNumber ?? "—"}
                </TableCell>
                <TableCell className="max-w-48 truncate">{row.customerName}</TableCell>
                <TableCell>
                  <ProviderCell row={row} />
                </TableCell>
                <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                  {formatAdminMoney(row.amount, row.currency)}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <Badge className={`whitespace-nowrap ${PAYMENT_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE}`}>
                      {humanizeEnum(row.status)}
                    </Badge>
                    {row.failureReason ? (
                      <p className="max-w-56 text-xs text-destructive">{row.failureReason}</p>
                    ) : null}
                    {row.retryHint ? (
                      <p className="max-w-64 text-xs text-muted-foreground">{row.retryHint}</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAdminDateTime(row.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedId(row.id)}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>

      <AdminTransactionDetailDialog
        transactionId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
