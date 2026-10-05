import { useState } from "react";
import { RefreshCcw, Undo2 } from "lucide-react";
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
import { EMPTY_ADMIN_RENTAL_FILTERS, type AdminRentalRow } from "../api";

/**
 * `/admin/rentals` — every rental in the marketplace.
 *
 * ## Buckets *and* statuses, because they answer different questions
 *
 * The customer list offers three buckets (`upcoming`, `active`, `completed`) because
 * a renter asks "what do I have" rather than "what is `RETURN_PENDING`". An
 * administrator asks both: the buckets to see the shape of the book, and the exact
 * status to chase one overdue item. The server already accepted both
 * (`adminRentalsQuerySchema` forwards them to `resolveRentalFilters`), so this is a
 * filter bar, not new server behaviour.
 *
 * ## No write controls, deliberately
 *
 * Advancing a rental's status is `POST /api/rentals/:id/return` and the lifecycle
 * rules that guard it — deposit settlement, availability release, overdue
 * notification — live in `lib/rental-lifecycle`. An admin table button that called
 * the same endpoint would work, but it would be a second, unguarded path to a state
 * machine that already has one correct caller. This screen is read-only by design;
 * the lifecycle owns the transitions.
 */

const BUCKET_OPTIONS = [
  { value: "", label: "Every stage" },
  { value: "upcoming", label: "Upcoming" },
  { value: "active", label: "In hand" },
  { value: "completed", label: "Finished" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "ACTIVE", label: "Active" },
  { value: "RETURN_PENDING", label: "Return pending" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "RETURNED", label: "Returned" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "DISPUTED", label: "Disputed" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "ending_soon", label: "Ending soonest" },
  { value: "starting_soon", label: "Starting soonest" },
];

/** True once the rental is no longer scheduled to the future. */
function isOverdue(row: AdminRentalRow): boolean {
  return row.status === "OVERDUE";
}

export function AdminRentalsPage() {
  const [filters, setFilters] = useState(EMPTY_ADMIN_RENTAL_FILTERS);
  const rentals = useAdminRentals(filters);

  // A filter change resets to page 1; paging is the only thing that may move the page
  // while the other filters stay put.
  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = rentals.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" ||
    filters.status !== null ||
    filters.bucket !== null ||
    filters.from !== "" ||
    filters.to !== "";

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Orders"
        title="Rentals"
        description="Every rental booking with its dates, deposit and parties. Read-only — the rental lifecycle owns status changes."
      />

      <AdminTableScaffold
        icon={RefreshCcw}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={rentals.isFetching && !rentals.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_RENTAL_FILTERS })}
        filters={[
          {
            key: "bucket",
            label: "Stage",
            value: filters.bucket ?? "",
            onChange: (value) => update({ bucket: value || null }),
            options: BUCKET_OPTIONS,
          },
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
          {
            key: "sort",
            label: "Sort",
            value: filters.sort,
            onChange: (value) => update({ sort: value }),
            options: SORT_OPTIONS,
          },
        ]}
        count={rentals.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={rentals.isLoading && !rentals.data}
        isError={rentals.isError}
        onRetry={() => void rentals.refetch()}
        emptyTitle={hasFilters ? "No rentals match" : "No rentals yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : "Rentals appear here once a customer books one of a seller's listings."
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
            labels={[
              "Item",
              "Order",
              "Renter",
              "Owner",
              "Window",
              "Rent",
              "Deposit",
              "Total",
              "Status",
            ]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-64">
                  <p className="truncate font-semibold">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Rental #{row.id}
                    {row.productSlug ? ` · ${row.productSlug}` : ""}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.orderNumber ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.renterName}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {row.ownerName}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <span className="block">{formatAdminDate(row.startDate)}</span>
                  <span className="block text-muted-foreground">
                    {formatAdminDate(row.endDate)}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatAdminMoney(row.rentalSubtotal)}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {formatAdminMoney(row.securityDeposit)}
                </TableCell>
                <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                  {formatAdminMoney(row.total)}
                </TableCell>
                <TableCell>
                  <RentalStatusCell row={row} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>
    </div>
  );
}

/**
 * The status chip, plus the return date when one exists.
 *
 * `actualReturnDate` is shown only when it is set: an empty cell next to a
 * "Returned" badge is ambiguous, whereas the date answers the question an
 * administrator actually has about a closed rental — *when* did it come back.
 */
function RentalStatusCell({ row }: { row: AdminRentalRow }) {
  return (
    <div className="space-y-1">
      <Badge
        className={`whitespace-nowrap ${RENTAL_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE}`}
      >
        {humanizeEnum(row.status)}
      </Badge>
      {row.actualReturnDate ? (
        <p className="whitespace-nowrap text-xs text-muted-foreground">
          <Undo2 size={12} aria-hidden className="mr-1 inline align-[-2px]" />
          {formatAdminDate(row.actualReturnDate)}
        </p>
      ) : isOverdue(row) ? (
        <p className="whitespace-nowrap text-xs font-semibold text-destructive">
          Due {formatAdminDate(row.endDate)}
        </p>
      ) : null}
    </div>
  );
}
