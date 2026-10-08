import { Card } from "@/components/ui/card";
import { useAdminOverview } from "../query";
import { AdminPageHeader } from "../components/AdminLayout";
import { OverviewCards } from "../components/OverviewCards";
import { AdminQuickActions } from "../components/AdminQuickActions";
import { AdminRecentActivity } from "../components/AdminRecentActivity";
import { AdminSystemStatus } from "../components/AdminSystemStatus";

/**
 * `/admin` — the workspace dashboard.
 *
 * The headline figures, the actions an administrator most often reaches for, and two
 * real status reads (recent audit activity and the health probe). It deliberately does
 * *not* try to be the catalogue: that is a table with eleven columns and its own
 * filters, and cramming it above the fold would bury the numbers an administrator
 * opens the page for.
 *
 * Nothing here is invented: the cards are live `COUNT`/`SUM` aggregates, the activity
 * list is audit rows that actions wrote, and the system status comes from
 * `/api/health`. Where there is no data the sections say so.
 */
export function AdminDashboardPage() {
  const overview = useAdminOverview();

  return (
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        eyebrow="Revaro admin"
        title="Dashboard"
        description="Live figures from the marketplace database. Nothing on this page is a stored total."
      />

      <OverviewCards
        data={overview.data}
        isLoading={overview.isLoading}
        isError={overview.isError}
        onRetry={() => void overview.refetch()}
      />

      <AdminQuickActions />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wider">Recent activity</h2>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            Every entry is a moderation action, written when it happened.
          </p>
          <AdminRecentActivity />
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider">System status</h2>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            Live probes — never assumed.
          </p>
          <AdminSystemStatus />
        </Card>
      </div>
    </div>
  );
}
