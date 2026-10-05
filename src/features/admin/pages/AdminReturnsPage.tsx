import { useState } from "react";
import { Undo2 } from "lucide-react";
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
import { formatAdminDate, formatAdminMoney, humanizeEnum } from "../components/format";
import { NEUTRAL_BADGE, RENTAL_STATUS_BADGE } from "../components/status-badge";
import { useAdminRentals } from "../query";
import { EMPTY_ADMIN_RENTAL_FILTERS } from "../api";

/**
 * `/admin/returns` — rentals whose item came back.
 *
 * ## Why this is a flag rather than a fourth bucket
 *
 * The customer's three buckets (`upcoming`, `active`, `completed`) are built on
 * `CLOSED_STATUSES` = `RETURNED | COMPLETED | CANCELLED`. A cancelled rental is closed
 * but nothing came back — the item never left — so reusing `completed` here would put
 * cancellations on a returns screen, and a cancellation is exactly the record someone
 * checking returns most needs to not see. The server therefore takes `returned=true`
 * alongside `bucket` (see `adminRentalsQuerySchema`) and ANDs the two.
 *
 * ## What this screen is for
 *
 * Reconciling: an item is back, the deposit is due for release, and the listing's
 * available quantity should have gone up. The actual return is recorded by the renter
 * through `POST /api/rentals/:id/return`, which runs the lifecycle (deposit, stock,
 * notification) — an admin table cannot do that part, so this is read-only, exactly
 * like `/admin/rentals`.
 *
 * The return date is the most important column here, so it is rendered in its own cell
 * rather than folded into the window, and a row with no return date — which should be
 * impossible under this filter — says so instead of showing a dash.
 */

export function AdminReturnsPage() {
  const [filters, setFilters] = useState({ ...EMPTY_ADMIN_RENTAL_FILTERS, returned: true });
  const rentals = useAdminRentals(filters);

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = rentals.data?.rows ?? [];
  const hasFilters = filters.search !== "" || filters.status !== null;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Orders"
        title="Returns"
        description="Rentals whose item came back, with the date it was received. Cancellations are excluded — nothing left for those."
      />

      <AdminTableScaffold
        icon={Undo2}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={rentals.isFetching && !rentals.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() =>
          setFilters({ ...EMPTY_ADMIN_RENTAL_FILTERS, returned: true })
        }
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: [
              { value: "", label: "Any status" },
              { value: "RETURNED", label: "Returned" },
              { value: "COMPLETED", label: "Completed" },
            ],
          },
        ]}
        count={rentals.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={rentals.isLoading && !rentals.data}
        isError={rentals.isError}
        onRetry={() => void rentals.refetch()}
        emptyTitle={hasFilters ? "No returns match" : "Nothing has come back yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : "Returned items appear here once a renter hands one back."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={rentals.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={["Item", "Order", "Renter", "Owner", "Window", "Returned", "Deposit", "Total", "Status"]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-64">
                  <p className="truncate font-semibold">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">Rental #{row.id}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.orderNumber ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.renterName}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.ownerName}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatAdminDate(row.startDate)} – {formatAdminDate(row.endDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-semibold">
                  {/* A dash here would be ambiguous: it reads as "not returned", which is
                      the one thing this screen says is impossible. */}
                  {row.actualReturnDate ? (
                    formatAdminDate(row.actualReturnDate)
                  ) : (
                    <span className="text-xs font-normal text-warning">
                      awaiting date
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatAdminMoney(row.securityDeposit)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                  {formatAdminMoney(row.total)}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`whitespace-nowrap ${RENTAL_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE}`}
                  >
                    {humanizeEnum(row.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>
    </div>
  );
}
