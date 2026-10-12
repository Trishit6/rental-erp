import { useState } from "react";
import { Flag, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { TableHead, TableHeader } from "@/components/ui/table";
import {
  AdminTable,
  AdminTableScaffold,
  TableBody,
  TableCell,
  TableRow,
} from "./AdminTableScaffold";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import { AdminModerationReportDialog } from "./AdminModerationReportDialog";
import { formatAdminDate, humanizeEnum } from "./format";
import {
  useAdminFlagWords,
  useAdminModerationBulkDecision,
  useAdminModerationReports,
  useAdminSearchFilters,
} from "../query";
import {
  EMPTY_ADMIN_MODERATION_FILTERS,
  flagWordMatches,
  type AdminModerationReportRow,
} from "../api";

/**
 * The reports queue — the same table `/admin/reports` and `/admin/moderation` show.
 *
 * ## A report is a work item, so the row answers "what do I need to decide?"
 *
 * The old list showed a reason and a status. That is not enough to work a queue:
 * a moderator needs to know what was reported, who reported it and what the target
 * currently is, and each row can be opened for the full context and history.
 * Deciding happens in the dialog, where the action and its reason are recorded
 * together.
 *
 * ## Bulk is deliberately narrow
 *
 * Several reports are dismissed at once; the server only accepts the two actions
 * that touch no target, because a bulk "hide every listing in this selection" is one
 * inverted filter away from an accident.
 *
 * ## Flag words badge, they do not decide
 *
 * The keyword list is a reading aid, not a rule: a row whose review or message body
 * contains a configured word is badged so it can be sorted to the top by eye. Nothing
 * is auto-hidden.
 */
const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
];

const TARGET_OPTIONS = [
  { value: "", label: "Any target" },
  { value: "product", label: "Listing" },
  { value: "user", label: "Account" },
  { value: "review", label: "Review" },
  { value: "message", label: "Message" },
  { value: "order", label: "Order" },
  { value: "rental", label: "Rental" },
];

const TARGET_LABEL: Record<string, string> = {
  product: "Listing",
  user: "Account",
  review: "Review",
  message: "Message",
  order: "Order",
  rental: "Rental",
};

const REPORT_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-warning/15 text-warning",
  IN_REVIEW: "bg-info/15 text-info",
  RESOLVED: "bg-success/15 text-success",
  DISMISSED: "bg-muted text-muted-foreground",
};

export function AdminReportsList() {
  const [filters, setFilters] = useAdminSearchFilters(EMPTY_ADMIN_MODERATION_FILTERS);
  const reports = useAdminModerationReports(filters);
  const flags = useAdminFlagWords();
  const bulkDecide = useAdminModerationBulkDecision();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bulkAction, setBulkAction] = useState<"RESOLVED" | "DISMISSED" | null>(null);

  const rows = reports.data?.rows ?? [];
  const flagWords = flags.data ?? [];
  const hasFilters = filters.search !== "" || filters.status !== null || filters.target !== null;

  function update(patch: Partial<typeof filters>) {
    // Any filter or page change invalidates the selection: acting on a row the
    // moderator can no longer see is the bulk-action footgun.
    setSelected(new Set());
    setFilters((current) => ({ ...current, ...patch, page: 1 }));
  }

  function toggleRow(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someOnPageSelected = rows.some((row) => selected.has(row.id));

  function toggleAllOnPage() {
    setSelected(allOnPageSelected ? new Set<number>() : new Set(rows.map((row) => row.id)));
  }

  function confirmBulk(reason: string) {
    if (!bulkAction) return;
    bulkDecide.mutate(
      { ids: [...selected], action: bulkAction, reason },
      {
        onSettled: () => {
          setSelected(new Set());
          setBulkAction(null);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <AdminTableScaffold
        icon={Flag}
        search={filters.search}
        onSearch={(search) => update({ search })}
        isSearching={reports.isFetching && !reports.isLoading}
        hasFilters={hasFilters}
        onClearFilters={() => {
          setSelected(new Set());
          setFilters({ ...EMPTY_ADMIN_MODERATION_FILTERS });
        }}
        filters={[
          {
            key: "status",
            label: "Status",
            value: filters.status ?? "",
            onChange: (value) => update({ status: value || null }),
            options: STATUS_OPTIONS,
          },
          {
            key: "target",
            label: "Target",
            value: filters.target ?? "",
            onChange: (value) => update({ target: value || null }),
            options: TARGET_OPTIONS,
          },
        ]}
        extraFilters={
          selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {selected.size} selected
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setBulkAction("RESOLVED")}
              >
                Resolve selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setBulkAction("DISMISSED")}
              >
                Dismiss selected
              </Button>
            </div>
          ) : undefined
        }
        count={reports.data?.total ?? 0}
        shownCount={rows.length}
        isLoading={reports.isLoading && !reports.data}
        isError={reports.isError}
        onRetry={() => void reports.refetch()}
        emptyTitle={hasFilters ? "Nothing matches" : "No reports"}
        emptyDescription={
          hasFilters
            ? "Nothing matches these filters. Try clearing one."
            : "Nothing has been reported. When a listing, review or account is flagged, it appears here."
        }
        pager={
          <Pagination
            page={filters.page}
            totalPages={reports.data?.totalPages ?? 1}
            onPageChange={(page) => {
              setSelected(new Set());
              setFilters((current) => ({ ...current, page }));
            }}
          />
        }
      >
        <AdminTable>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="size-4 align-middle"
                  checked={allOnPageSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = !allOnPageSelected && someOnPageSelected;
                  }}
                  onChange={toggleAllOnPage}
                  aria-label={
                    allOnPageSelected ? "Clear this page's selection" : "Select every report on this page"
                  }
                />
              </TableHead>
              <TableHead>Report</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    className="size-4 align-middle"
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    aria-label={`Select report #${row.id}`}
                  />
                </TableCell>
                <TableCell className="max-w-64">
                  <p className="font-semibold">{humanizeEnum(row.reason)}</p>
                  {row.details ? (
                    <p className="truncate text-xs text-muted-foreground" title={row.details}>
                      {row.details}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">
                    #{row.id} · {formatAdminDate(row.createdAt)}
                  </p>
                </TableCell>
                <TableCell className="max-w-64">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {TARGET_LABEL[row.targetType] ?? row.targetType}
                  </p>
                  <p className="truncate text-sm" title={row.targetLabel}>
                    {row.targetLabel}
                  </p>
                  <FlagWords row={row} words={flagWords} />
                </TableCell>
                <TableCell className="max-w-40 truncate text-muted-foreground">
                  {row.reporterName}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`whitespace-nowrap ${
                      REPORT_STATUS_BADGE[row.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {humanizeEnum(row.status)}
                  </Badge>
                  {row.action ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {humanizeEnum(row.action)}
                      {row.resolvedByName ? ` · ${row.resolvedByName}` : ""}
                    </p>
                  ) : null}
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

      <AdminModerationReportDialog
        reportId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />

      <AdminConfirmDialog
        open={bulkAction !== null}
        onOpenChange={(open) => {
          if (!open) setBulkAction(null);
        }}
        subject={`${selected.size} report${selected.size === 1 ? "" : "s"}`}
        title={bulkAction === "DISMISSED" ? "Dismiss these reports?" : "Resolve these reports?"}
        requireReason
        reasonLabel="Reason (recorded on every report)"
        body={
          <p>
            {bulkAction === "DISMISSED"
              ? "No action is taken on the reported content and each report is closed as dismissed."
              : "Each report is closed as resolved without changing the reported content."}
          </p>
        }
        confirmLabel={bulkAction === "DISMISSED" ? "Dismiss all" : "Resolve all"}
        isSubmitting={bulkDecide.isPending}
        onConfirm={confirmBulk}
      />
    </div>
  );
}

function FlagWords({ row, words }: { row: AdminModerationReportRow; words: string[] }) {
  if (row.targetType !== "review" && row.targetType !== "message") return null;
  const matched = flagWordMatches(row.targetLabel, words);
  if (matched.length === 0) return null;
  return (
    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-warning">
      <Tag size={11} aria-hidden />
      flagged: {matched.join(", ")}
    </p>
  );
}
