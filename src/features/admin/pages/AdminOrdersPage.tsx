import { useState } from "react";
import { ClipboardList, ShoppingBag } from "lucide-react";
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
import { AdminOrderDetailDialog } from "../components/AdminOrderDetailDialog";
import { AdminOrderHealthPanel } from "../components/AdminOrderHealthPanel";
import { formatAdminDate, formatAdminMoney, humanizeEnum } from "../components/format";
import { NEUTRAL_BADGE, ORDER_STATUS_BADGE, PAYMENT_STATUS_BADGE } from "../components/status-badge";
import { useAdminOrders, useAdminSearchFilters } from "../query";
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

/**
 * `/admin/orders`, and (with `mode="purchases"`) `/admin/purchases`.
 *
 * The purchases view is the same table with the type filter pinned — one
 * implementation, two entry points, so the two surfaces can never disagree about
 * what a purchase order looks like.
 *
 * ## Why the row's control is "Manage", not "Confirm"
 *
 * The table used to carry a single quick action per row, which meant this file held a
 * second copy of the status ladder — one that could not know about a pickup order, an
 * override, or a cancellation. The server now returns `nextStatuses` for the order
 * itself; the dialog shows them. The table's job is to get the operator there. The
 * quick action is gone not because it was slow but because it was a duplicate of a rule
 * that already has one home.
 */
export function AdminOrdersPage({ mode = "all" }: { mode?: "all" | "purchases" }) {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_ORDER_FILTERS);
  const effective = mode === "purchases" ? { ...filters, type: "PURCHASE" } : filters;
  const orders = useAdminOrders(effective);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = orders.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" ||
    filters.status !== null ||
    (mode === "all" && filters.type !== null) ||
    filters.paymentStatus !== null ||
    filters.minAmount !== null ||
    filters.maxAmount !== null;

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

      {mode === "all" ? <AdminOrderHealthPanel onOpenOrder={setSelectedId} /> : null}

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
        extraFilters={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Min ₹
              <Input
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                value={filters.minAmount ?? ""}
                onChange={(event) =>
                  update({ minAmount: event.target.value === "" ? null : Number(event.target.value) })
                }
                className="h-9 w-24"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Max ₹
              <Input
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                value={filters.maxAmount ?? ""}
                onChange={(event) =>
                  update({ maxAmount: event.target.value === "" ? null : Number(event.target.value) })
                }
                className="h-9 w-24"
              />
            </label>
          </div>
        }
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
              <OrderRow key={row.id} row={row} onOpen={() => setSelectedId(row.id)} />
            ))}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>

      <AdminOrderDetailDialog
        orderId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

function OrderRow({ row, onOpen }: { row: AdminOrderRow; onOpen: () => void }) {
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
          <Button type="button" variant="secondary" size="sm" onClick={onOpen}>
            Manage
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
