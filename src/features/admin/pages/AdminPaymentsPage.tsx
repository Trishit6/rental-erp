import { CreditCard, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { formatAdminDateTime, formatAdminMoney, humanizeEnum } from "../components/format";
import { NEUTRAL_BADGE, PAYMENT_STATUS_BADGE } from "../components/status-badge";
import { useAdminSearchFilters, useAdminTransactions } from "../query";
import { EMPTY_ADMIN_TRANSACTION_FILTERS, type AdminTransactionRow } from "../api";

/**
 * `/admin/payments` — the money ledger, and `/admin/refunds` pinned to refunds.
 *
 * ## Read-only, and that is a design decision
 *
 * Every row here is a `transactions` record: a provider's view of money moving. The
 * brief asks for refunds in the admin workspace, and the honest form of that is a
 * *filter on the ledger*, not a "Refund" button. A button that marked a transaction
 * REFUNDED would be a lie — the money would not have moved, the provider would not know,
 * and the ledger would disagree with the bank. Refunds are initiated through the order
 * or payment flow that owns them (which calls the provider first), and this table is how
 * an administrator confirms the result.
 *
 * So refunds are a pinned `type=REFUND` on the same table: one implementation, and the
 * refund view can never show a payment that the payments view hides.
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

export function AdminPaymentsPage({ mode = "all" }: { mode?: "all" | "refunds" }) {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_TRANSACTION_FILTERS);
  const refundsOnly = mode === "refunds";
  const effective = refundsOnly ? { ...filters, type: "REFUND" } : filters;
  const transactions = useAdminTransactions(effective);

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = transactions.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" || filters.status !== null || (!refundsOnly && filters.type !== null);

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Finance"
        title={refundsOnly ? "Refunds" : "Payments"}
        description={
          refundsOnly
            ? "Every refund recorded against a payment. Refunds are issued through the order flow; this is the record of what it produced."
            : "Payments, refunds and payouts as the provider reported them. Searchable by provider reference, order number or email."
        }
      />

      <AdminTableScaffold
        icon={refundsOnly ? RotateCcw : CreditCard}
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
          ...(refundsOnly
            ? []
            : [
                {
                  key: "type",
                  label: "Type",
                  value: filters.type ?? "",
                  onChange: (value: string) => update({ type: value || null }),
                  options: TYPE_OPTIONS,
                },
              ]),
        ]}
        count={transactions.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={transactions.isLoading && !transactions.data}
        isError={transactions.isError}
        onRetry={() => void transactions.refetch()}
        emptyTitle={hasFilters ? "Nothing matches" : refundsOnly ? "No refunds yet" : "No transactions yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : refundsOnly
              ? "Refunds appear here once an order is refunded."
              : "Payments appear here once a customer completes checkout."
        }
        pager={
          <Pagination
            page={effective.page}
            totalPages={transactions.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={["Reference", "Type", "Order", "Customer", "Provider", "Amount", "Status", "When"]}
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
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAdminDateTime(row.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>
    </div>
  );
}
