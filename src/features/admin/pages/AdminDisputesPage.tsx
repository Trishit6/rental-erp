import { useState } from "react";
import { Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { AdminDisputeDetailDialog } from "../components/AdminDisputeDetailDialog";
import { formatAdminDate, formatAdminDateTime, humanizeEnum } from "../components/format";
import { MODERATION_STATUS_BADGE, NEUTRAL_BADGE } from "../components/status-badge";
import { useAdminDisputes, useAdminSearchFilters } from "../query";
import { EMPTY_ADMIN_DISPUTE_FILTERS } from "../api";

/**
 * `/admin/disputes` — the disagreement queue.
 *
 * ## One queue, not a folder per party
 *
 * A dispute is between two people, so a per-party view would show the same row twice
 * and invite contradictory decisions. The queue is flat and the detail view names both
 * sides (`opener` and `against`) with the order underneath, which is what an operator
 * needs to decide: who said what, about which order, and what evidence exists.
 *
 * ## The row opens; the decision lives in the dialog
 *
 * Deciding is a considered action with a written resolution and an optional refund, so
 * it does not belong on a table row where it is one mis-click from a bulk selection. The
 * table gets an operator to the dispute; the dialog is where they commit.
 */

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
];

export function AdminDisputesPage() {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_DISPUTE_FILTERS);
  const disputes = useAdminDisputes(filters);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = disputes.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" ||
    filters.status !== null ||
    filters.from !== "" ||
    filters.to !== "";

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Moderation"
        title="Disputes"
        description="Every order disagreement, both parties named. Record a decision with a written resolution; an optional refund is opened as a request."
      />

      <AdminTableScaffold
        icon={Scale}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={disputes.isFetching && !disputes.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_DISPUTE_FILTERS })}
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
        ]}
        extraFilters={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              From
              <Input
                type="date"
                value={filters.from}
                onChange={(event) => update({ from: event.target.value })}
                className="h-9 w-auto"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              To
              <Input
                type="date"
                value={filters.to}
                onChange={(event) => update({ to: event.target.value })}
                className="h-9 w-auto"
              />
            </label>
          </div>
        }
        count={disputes.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={disputes.isLoading && !disputes.data}
        isError={disputes.isError}
        onRetry={() => void disputes.refetch()}
        emptyTitle={hasFilters ? "No disputes match" : "No disputes"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : "When a customer or seller disputes an order it appears here, with both parties named."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={disputes.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={["Dispute", "Order", "Opened by", "Against", "Reason", "Opened", "Status", ""]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  <p className="font-semibold">{row.disputeNumber}</p>
                  {row.resolvedAt ? (
                    <p className="text-xs text-muted-foreground">
                      decided {formatAdminDate(row.resolvedAt)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.orderNumber ?? `#${row.orderId}`}
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.openerName}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.againstName ?? "—"}
                </TableCell>
                <TableCell className="max-w-72">
                  <p className="truncate text-sm" title={row.reason}>
                    {row.reason}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAdminDateTime(row.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`whitespace-nowrap ${MODERATION_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE}`}
                  >
                    {humanizeEnum(row.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>

      <AdminDisputeDetailDialog
        disputeId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
