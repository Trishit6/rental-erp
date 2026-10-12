import { useState } from "react";
import { LifeBuoy } from "lucide-react";
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
import { AdminSupportTicketDialog } from "../components/AdminSupportTicketDialog";
import { AdminOrderDetailDialog } from "../components/AdminOrderDetailDialog";
import { formatAdminDate, formatAdminDateTime, humanizeEnum } from "../components/format";
import {
  NEUTRAL_BADGE,
  TICKET_PRIORITY_BADGE,
  TICKET_STATUS_BADGE,
} from "../components/status-badge";
import { useAdminSearchFilters, useAdminSupportTickets } from "../query";
import {
  EMPTY_ADMIN_SUPPORT_FILTERS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type AdminTicketPriority,
  type AdminTicketStatus,
} from "../api";

/**
 * `/admin/support` — the staff support inbox (PROMPT 30).
 *
 * ## A queue, not a table of records
 *
 * The same ticket data the customer sees, ordered by `updatedAt` and filtered to the
 * work left open. An agent opens one from the row; the row itself carries just enough
 * to decide *whether* to open it (who is waiting, how urgent, who has it).
 *
 * ## The refund hand-off
 *
 * A ticket linked to an order can open the real order dialog. That dialog is the only
 * place a refund is created, so the "support can read but not return money" boundary is
 * the `orders.refund` grant, enforced in one place rather than re-implemented here.
 */
const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  ...TICKET_STATUSES.map((value) => ({ value, label: TICKET_STATUS_LABELS[value] })),
];

const PRIORITY_OPTIONS = [
  { value: "", label: "Any priority" },
  ...TICKET_PRIORITIES.map((value) => ({ value, label: TICKET_PRIORITY_LABELS[value] })),
];

const ASSIGNEE_OPTIONS = [
  { value: "", label: "Anyone" },
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
];

export function AdminSupportPage() {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_SUPPORT_FILTERS);
  const tickets = useAdminSupportTickets(filters);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const rows = tickets.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" ||
    filters.status !== null ||
    filters.priority !== null ||
    filters.assignee !== null;

  function update(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch, page: 1 }));
  }

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Support"
        title="Support inbox"
        description="Tickets raised by customers, newest activity first, with the whole conversation in one place."
      />

      <AdminTableScaffold
        icon={LifeBuoy}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={tickets.isFetching && !tickets.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_SUPPORT_FILTERS })}
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
          {
            key: "priority",
            label: "Priority",
            value: filters.priority ?? "",
            onChange: (value) => update({ priority: value || null }),
            options: PRIORITY_OPTIONS,
          },
          {
            key: "assignee",
            label: "Assignee",
            value: filters.assignee ?? "",
            onChange: (value) => update({ assignee: value || null }),
            options: ASSIGNEE_OPTIONS,
          },
        ]}
        count={tickets.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={tickets.isLoading && !tickets.data}
        isError={tickets.isError}
        onRetry={() => void tickets.refetch()}
        emptyTitle={hasFilters ? "Nothing matches" : "The inbox is empty"}
        emptyDescription={
          hasFilters
            ? "No tickets match these filters. Try clearing one."
            : "No tickets have been raised. When a customer writes in, it appears here."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={tickets.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead
            labels={["Ticket", "Requester", "Status", "Priority", "Assignee", "SLA", ""]}
          />
          <TableBody>
            {rows.map((row) => {
              const sla = slaLabel(row.slaDueAt);
              return (
                <TableRow key={row.id}>
                  <TableCell className="max-w-72">
                    <p className="truncate font-semibold" title={row.subject}>
                      {row.subject}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.ticketNumber} · updated {formatAdminDateTime(row.updatedAt)}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-48">
                    <p className="truncate">{row.requesterName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {row.requesterEmail}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`whitespace-nowrap ${
                        TICKET_STATUS_BADGE[row.status] ?? NEUTRAL_BADGE
                      }`}
                    >
                      {TICKET_STATUS_LABELS[row.status as AdminTicketStatus] ??
                        humanizeEnum(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`whitespace-nowrap ${
                        TICKET_PRIORITY_BADGE[row.priority] ?? NEUTRAL_BADGE
                      }`}
                    >
                      {TICKET_PRIORITY_LABELS[row.priority as AdminTicketPriority] ??
                        humanizeEnum(row.priority)}
                    </Badge>
                  </TableCell>
                  <TableCell className="truncate text-muted-foreground">
                    {row.assigneeName ?? "Unassigned"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        sla.overdue ? "font-semibold text-destructive" : "text-muted-foreground"
                      }
                    >
                      {sla.text}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedTicketId(row.id)}
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </AdminTable>
      </AdminTableScaffold>

      <AdminSupportTicketDialog
        ticketId={selectedTicketId}
        open={selectedTicketId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTicketId(null);
        }}
        onOpenOrder={(orderId) => {
          // Close the ticket and open the order: two stacked dialogs is a navigation
          // trap, and the refund belongs to the order screen.
          setSelectedTicketId(null);
          setSelectedOrderId(orderId);
        }}
      />

      <AdminOrderDetailDialog
        orderId={selectedOrderId}
        open={selectedOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
      />
    </div>
  );
}

/** An SLA due date, flagged when it has passed. `—` when no SLA was ever set. */
function slaLabel(slaDueAt: string | null): { text: string; overdue: boolean } {
  if (!slaDueAt) return { text: "—", overdue: false };
  const due = new Date(slaDueAt);
  if (Number.isNaN(due.getTime())) return { text: "—", overdue: false };
  return { text: formatAdminDate(due), overdue: due.getTime() < Date.now() };
}
