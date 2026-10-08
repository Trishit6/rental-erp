import { ClipboardList, ShoppingBag } from "lucide-react";
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
import { formatAdminDate, formatAdminMoney, humanizeEnum } from "../components/format";
import { NEUTRAL_BADGE, ORDER_STATUS_BADGE, PAYMENT_STATUS_BADGE } from "../components/status-badge";
import { useAdminOrders, useAdminOrderStatusMutation, useAdminSearchFilters } from "../query";
import { EMPTY_ADMIN_ORDER_FILTERS, type AdminOrderRow } from "../api";

const ORDER_STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "PENDING_PAYMENT", label: "Pending payment" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY_FOR_PICKUP", label: "Ready for pickup" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const ORDER_TYPE_OPTIONS = [
  { value: "", label: "Buy or rent" },
  { value: "PURCHASE", label: "Purchases" },
  { value: "RENTAL", label: "Rentals" },
  { value: "MIXED", label: "Mixed" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "Any payment" },
  { value: "PENDING", label: "Payment pending" },
  { value: "PAID", label: "Paid" },
  { value: "FAILED", label: "Failed" },
  { value: "REFUNDED", label: "Refunded" },
];

/** The one next status an admin may set from the table, per current status. */
const NEXT_STATUSES: Record<string, { value: string; label: string }> = {
  PENDING_PAYMENT: { value: "CONFIRMED", label: "Confirm" },
  CONFIRMED: { value: "PROCESSING", label: "Process" },
  PROCESSING: { value: "SHIPPED", label: "Ship" },
  READY_FOR_PICKUP: { value: "DELIVERED", label: "Mark delivered" },
  SHIPPED: { value: "DELIVERED", label: "Mark delivered" },
  DELIVERED: { value: "COMPLETED", label: "Complete" },
};

/**
 * `/admin/orders`, and (with `mode="purchases"`) `/admin/purchases`.
 *
 * The purchases view is the same table with the type filter pinned — one
 * implementation, two entry points, so the two surfaces can never disagree about
 * what a purchase order looks like.
 */
export function AdminOrdersPage({ mode = "all" }: { mode?: "all" | "purchases" }) {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_ORDER_FILTERS);
  const effective = mode === "purchases" ? { ...filters, type: "PURCHASE" } : filters;
  const orders = useAdminOrders(effective);
  const setStatus = useAdminOrderStatusMutation();

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = orders.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" ||
    filters.status !== null ||
    (mode === "all" && filters.type !== null) ||
    filters.paymentStatus !== null;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Orders"
        title={mode === "purchases" ? "Purchases" : "All orders"}
        description={
          mode === "purchases"
            ? "Orders containing purchased goods. Every status change is written to the audit log."
            : "Every order in the marketplace. Search, filters and paging all run in the database."
        }
      />

      <AdminTableScaffold
        icon={mode === "purchases" ? ShoppingBag : ClipboardList}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={orders.isFetching && !orders.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_ORDER_FILTERS })}
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: ORDER_STATUS_OPTIONS,
          },
          ...(mode === "all"
            ? [
                {
                  key: "type",
                  label: "Type",
                  value: filters.type ?? "",
                  onChange: (value: string) => update({ type: value || null }),
                  options: ORDER_TYPE_OPTIONS,
                },
              ]
            : []),
          {
            key: "payment",
            label: "Payment",
            value: filters.paymentStatus ?? "",
            onChange: (value) => update({ paymentStatus: value || null }),
            options: PAYMENT_STATUS_OPTIONS,
          },
        ]}
        count={orders.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={orders.isLoading && !orders.data}
        isError={orders.isError}
        onRetry={() => void orders.refetch()}
        emptyTitle={hasFilters ? "No orders match" : "No orders yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : "Orders appear here once customers check out."
        }
        pager={
          <Pagination
            page={effective.page}
            totalPages={orders.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={["Order", "Customer", "Type", "Items", "Amount", "Payment", "Status", "Date", "Actions"]}
          />
          <TableBody>
            {rows.map((row) => (
              <OrderRow
                key={row.id}
                row={row}
                disabled={setStatus.isPending}
                onNext={() => {
                  const next = NEXT_STATUSES[row.status];
                  if (next) setStatus.mutate({ id: row.id, status: next.value });
                }}
              />
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>
    </div>
  );
}

function OrderRow({
  row,
  disabled,
  onNext,
}: {
  row: AdminOrderRow;
  disabled: boolean;
  onNext: () => void;
}) {
  const next = NEXT_STATUSES[row.status];
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-semibold">
        {row.orderNumber ?? `#${row.id}`}
      </TableCell>
      <TableCell className="max-w-56">
        <p className="truncate font-semibold">{row.customerName}</p>
        <p className="truncate text-xs text-muted-foreground">{row.customerEmail}</p>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {row.orderType.toLowerCase()}
      </TableCell>
      <TableCell className="tabular-nums">{row.itemCount}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatAdminMoney(row.total, row.currency)}
      </TableCell>
      <TableCell>
        <Badge className={`whitespace-nowrap ${PAYMENT_STATUS_BADGE[row.paymentStatus] ?? NEUTRAL_BADGE}`}>
          {humanizeEnum(row.paymentStatus)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge className={`whitespace-nowrap ${ORDER_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE}`}>
          {humanizeEnum(row.status)}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatAdminDate(row.createdAt)}
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          {next ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              disabled={disabled}
              onClick={onNext}
            >
              {next.label}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
