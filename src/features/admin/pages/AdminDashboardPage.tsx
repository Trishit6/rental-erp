import { Card } from "@/components/ui/card";
import { useAdminOverview } from "../query";
import { AdminPageHeader } from "../components/AdminLayout";
import { OverviewCards } from "../components/OverviewCards";

/**
 * `/admin` — the workspace dashboard.
 *
 * The headline figures plus a short pointer onward. It deliberately does *not* try to
 * be the catalogue: that is a table with eleven columns and its own filters, and
 * cramming it above the fold would bury the numbers an administrator opens the page
 * for.
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

      <Card className="p-4">
        <h2 className="text-sm font-bold">Where to next</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          <li>
            <span className="font-semibold text-foreground">Products</span> — search, filter, sort,
            edit any listing, archive or delete it, and change several at once.
          </li>
          <li>
            <span className="font-semibold text-foreground">Orders and rentals</span> — every
            purchase, every rental booking, and the items that have come back.
          </li>
          <li>
            <span className="font-semibold text-foreground">Finance</span> — revenue, seller
            earnings, fees and payouts, plus the per-transaction ledger.
          </li>
          <li>
            <span className="font-semibold text-foreground">Moderation</span> — reported content,
            hidden reviews and suspended accounts.
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground/80">
          Every section in the sidebar is a live page backed by the database. Financial history is
          read-only — it is written by the checkout, rental and payout flows, never edited here.
        </p>
      </Card>
    </div>
  );
}
