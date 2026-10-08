import { AdminPageHeader } from "../components/AdminLayout";
import { AdminReportsList } from "../components/AdminReportsList";

/**
 * `/admin/reports` — the reports queue.
 *
 * The same queue the moderation hub's Reports tab shows, given its own page: the
 * Moderation section of the sidebar points here, and the hub keeps the tab for
 * working all three queues (reports, reviews, suspended accounts) in one place.
 */
export function AdminReportsPage() {
  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Moderation"
        title="Reports"
        description="Listings and reviews flagged by the community, awaiting a decision."
      />
      <AdminReportsList />
    </div>
  );
}