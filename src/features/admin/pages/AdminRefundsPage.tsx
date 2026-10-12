import { useState } from "react";
import { RotateCcw } from "lucide-react";
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
import { AdminRefundDetailDialog } from "../components/AdminRefundDetailDialog";
import { formatAdminDate, formatAdminMoney, humanizeEnum } from "../components/format";
import { NEUTRAL_BADGE, PAYMENT_STATUS_BADGE } from "../components/status-badge";
import { useAdminRefunds, useAdminSearchFilters } from "../query";
import { EMPTY_ADMIN_REFUND_FILTERS } from "../api";

/**
 * `/admin/refunds` — the refund review queue (PROMPT 28).
 *
 * ## Why this is its own page, not a filter on the ledger
 *
 * A *request* and a *transaction* are different facts. The payments ledger shows money
 * that moved; this queue shows money somebody has asked to move and an operator has to
 * decide. Rendering requests as ledger rows would show a refund that has not happened
 * yet, indistinguishable from one that has — which is the exact confusion the finance
 * brief is written to prevent.
 *
 * ## Approving is the only thing here that moves money
 *
 * The queue is read-only apart from the decision, and the decision is where the money
 * is actually returned through the provider. It requires `refunds.approve` and a fresh
 * step-up, both enforced server-side; this page merely does not offer the button to an
 * account that would be refused anyway.
 */
const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Pending review" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SUCCEEDED", label: "Returned" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Declined" },
];

export function AdminRefundsPage() {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_REFUND_FILTERS);
  const refunds = useAdminRefunds(filters);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = refunds.data?.rows ?? [];
  const hasFilters = filters.search !== "" || filters.status !== null;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Finance"
        title="Refunds"
        description="Refund requests awaiting a decision. Approving returns the money through the payment provider and tells the customer; declining tells them too."
      />

      <AdminTableScaffold
        icon={RotateCcw}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={refunds.isFetching && !refunds.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_REFUND_FILTERS })}
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
        ]}
        count={refunds.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={refunds.isLoading && !refunds.data}
        isError={refunds.isError}
        onRetry={() => void refunds.refetch()}
        emptyTitle={hasFilters ? "No refunds match" : "No refunds"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : "Refunds appear here when an operator requests one from an order."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={refunds.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={["Refund", "Order", "Customer", "Amount", "Requested", "Status", ""]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  <p className="font-semibold">{row.refundNumber}</p>
                  {row.providerReference ? (
                    <p className="text-xs text-muted-foreground">{row.providerReference}</p>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.orderNumber ?? `#${row.orderId}`}
                </TableCell>
                <TableCell className="max-w-48 truncate">{row.customerName}</TableCell>
                <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                  {formatAdminMoney(row.amount, row.currency)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAdminDate(row.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`whitespace-nowrap ${
                      PAYMENT_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE
                    }`}
                  >
                    {humanizeEnum(row.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedId(row.id)}
                  >
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>

      <AdminRefundDetailDialog
        refundId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
