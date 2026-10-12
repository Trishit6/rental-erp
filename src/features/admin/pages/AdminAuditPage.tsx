import { useState } from "react";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
 * ## Why the row carries provenance, not just a sentence
 *
 * A "details" column alone answers *what* changed; it does not answer *who, from where,
 * on whose session, and why* — the four questions an incident review actually asks. The
 * enriched entry (PROMPT 22) fills them: actor role, mandatory reason, IP, user agent and
 * the request id that ties the row back to the server logs. The reason and before/after
 * snapshot are surfaced in the detail cell while the raw correlation id stays compact.
 */

const ENTITY_OPTIONS = [
  { value: "", label: "Every record type" },
  { value: "product", label: "Products" },
  { value: "order", label: "Orders" },
  { value: "rental", label: "Rentals" },
  { value: "user", label: "Users" },
  { value: "seller", label: "Sellers" },
  { value: "role", label: "Roles" },
  { value: "review", label: "Reviews" },
  { value: "category", label: "Categories" },
  { value: "image", label: "Images" },
  { value: "payout", label: "Payouts" },
  { value: "report", label: "Reports" },
  { value: "ticket", label: "Tickets" },
];

/** Humanise an action name: `RBAC_ROLES_SET` → `rbac roles set`. */
function humanizeAction(action: string): string {
  return action.replace(/_/g, " ").toLowerCase();
}

export function AdminAuditPage() {
  const [filters, setFilters] = useState(EMPTY_ADMIN_AUDIT_FILTERS);
  const audit = useAdminAuditLog(filters);

  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 1 }));

  const rows = audit.data?.rows ?? [];
  const hasFilters =
    filters.search !== "" ||
    filters.entityType !== null ||
    filters.from !== "" ||
    filters.to !== "";

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="System"
        title="Audit log"
        description="Every administrative action, with who did it, as what role, from where and why. Entries are written by the action itself and cannot be edited."
      />

      <AdminTableScaffold
        icon={ScrollText}
        search={filters.search}
        onSearch={(search) => update({ search })}
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
        count={audit.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={audit.isLoading && !audit.data}
        isError={audit.isError}
        onRetry={() => void audit.refetch()}
        emptyTitle={hasFilters ? "No entries match" : "No activity yet"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try a different term, record type or date range."
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
          <AdminTableHead
            labels={["Action", "Record", "Administrator", "Reason & detail", "Source", "When"]}
          />
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge className="whitespace-nowrap bg-primary/12 text-primary">
                    {humanizeAction(row.action)}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  <span className="text-muted-foreground">{row.entityType}</span>
                  {row.entityId !== null ? (
                    <span className="font-semibold"> #{row.entityId}</span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="block">{row.adminName}</span>
                  {row.actorRole ? (
                    <span className="block text-xs text-muted-foreground">{row.actorRole}</span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-xl text-xs text-muted-foreground">
                  {row.reason ? (
                    <span className="mb-0.5 block font-semibold text-foreground">
                      “{row.reason}”
                    </span>
                  ) : null}
                  {row.details ?? (row.reason ? null : "—")}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  <span className="block">{row.ip ?? "—"}</span>
                  {row.requestId ? (
                    <span className="block font-mono text-[10px]" title={row.requestId}>
                      {row.requestId.slice(0, 8)}…
                    </span>
                  ) : null}
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
