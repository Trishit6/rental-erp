import { useState } from "react";
import { ScrollText } from "lucide-react";
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
import { formatAdminDateTime } from "../components/format";
import { useAdminAuditLog } from "../query";
import { EMPTY_ADMIN_AUDIT_FILTERS } from "../api";

/**
 * `/admin/audit-log` — what administrators did.
 *
 * ## Read-only by construction, not by convention
 *
 * There is no write endpoint for this table. Every row is produced by a
 * `recordAudit(...)` call inside a route that already performed the action, so the log
 * cannot be edited even by the administrator reading it. That is the point: a moderation
 * trail whose entries can be corrected afterwards records intentions, not events.
 *
 * ## Reading it as prose rather than JSON
 *
 * `details` is free text written by the handler at the moment of the change ("Set the
 * order to SHIPPED"). It is shown as written, wrapped, rather than pretty-printed — an
 * administrator reading this wants to know what happened, and a JSON blob is a thing to
 * decode rather than a thing to read.
 */

const ENTITY_OPTIONS = [
  { value: "", label: "Every record type" },
  { value: "product", label: "Products" },
  { value: "order", label: "Orders" },
  { value: "rental", label: "Rentals" },
  { value: "user", label: "Users" },
  { value: "seller", label: "Sellers" },
  { value: "review", label: "Reviews" },
  { value: "category", label: "Categories" },
  { value: "image", label: "Images" },
  { value: "payout", label: "Payouts" },
  { value: "report", label: "Reports" },
];

export function AdminAuditPage() {
  const [filters, setFilters] = useState(EMPTY_ADMIN_AUDIT_FILTERS);
  const audit = useAdminAuditLog(filters);

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = audit.data?.rows ?? [];
  const hasFilters = filters.action !== "" || filters.entityType !== null;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="System"
        title="Audit log"
        description="Every moderation action, with who did it and when. Entries are written by the action itself and cannot be edited."
      />

      <AdminTableScaffold
        icon={ScrollText}
        search={filters.action}
        onSearch={(action) => update({ action })}
        isSearching={audit.isFetching && !audit.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => setFilters({ ...EMPTY_ADMIN_AUDIT_FILTERS })}
        filters={[
          {
            key: "entity",
            label: "Record type",
            value: filters.entityType ?? "",
            onChange: (value) => update({ entityType: value || null }),
            options: ENTITY_OPTIONS,
          },
        ]}
        count={audit.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={audit.isLoading && !audit.data}
        isError={audit.isError}
        onRetry={() => void audit.refetch()}
        emptyTitle={hasFilters ? "No entries match" : "No activity yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try a different action or record type."
            : "Administrative actions are recorded here as they happen."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={audit.data?.totalPages ?? 1}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        }
      >
        <AdminTable>
          <AdminTableHead labels={["Action", "Record", "Administrator", "Detail", "When"]} />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge className="whitespace-nowrap bg-primary/12 text-primary">
                    {row.action.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  <span className="text-muted-foreground">{row.entityType}</span>
                  {row.entityId !== null ? (
                    <span className="font-semibold"> #{row.entityId}</span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.adminName}</TableCell>
                <TableCell className="max-w-xl text-xs text-muted-foreground">
                  {row.details ?? "—"}
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
