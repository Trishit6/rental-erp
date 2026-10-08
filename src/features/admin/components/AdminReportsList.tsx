import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { useAdminActions, useAdminReports } from "../query";

/**
 * The reports queue — the same list the moderation hub shows, extracted so
 * `/admin/moderation` (its Reports tab) and `/admin/reports` are one implementation.
 *
 * Reports are real rows from the `reports` table; resolving or dismissing writes a
 * status back through `PATCH /api/admin/reports/:id` and re-reads the queue. The
 * list is not paginated here because a moderation queue is short by nature — an
 * open queue of hundreds is a different (and future) product.
 */
export function AdminReportsList() {
  const { data: reports } = useAdminReports(true);
  const { resolveReport } = useAdminActions();

  if (reports === undefined) {
    return (
      <Card className="p-4">
        <p className="py-6 text-center text-sm text-muted-foreground">Loading reports…</p>
      </Card>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={Flag}
        title="No reports"
        description="Nothing has been reported. When a listing or review is flagged, it appears here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <Card key={report.id} className="flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">{report.reason}</p>
            {report.details ? (
              <p className="text-xs text-muted-foreground">{report.details}</p>
            ) : null}
          </div>
          <Badge
            className={
              report.status === "OPEN" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
            }
          >
            {report.status}
          </Badge>
          {report.status === "OPEN" ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void resolveReport(report.id, "RESOLVED")}>
                Resolve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void resolveReport(report.id, "DISMISSED")}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}