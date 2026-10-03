import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminLayout } from "@/features/admin";
import { requireAdmin } from "@/lib/auth/guards";

/**
 * The `/admin` layout.
 *
 * ## Why this is a layout and not the dashboard route
 *
 * The dashboard used to live at `/admin` itself, with the catalogue and moderation
 * reachable only as tab strips inside it. Splitting them into real routes means each
 * is linkable, refreshable and independently permissioned — and it means the sidebar
 * can be defined once, here, instead of in every page.
 *
 * ## Why the guard is here *and* on the server
 *
 * `beforeLoad` stops a non-admin from ever rendering the shell or fetching its data,
 * which is the fast, friendly half. The authoritative half is `requireAdmin` on
 * every `/api/admin/*` route in `server/routes/admin.ts`: typing `/admin` into the
 * address bar must not be enough, and hiding the UI is not authorization. Both are
 * needed; neither alone is.
 */
export const Route = createFileRoute("/admin")({
  beforeLoad: requireAdmin,
  component: AdminRouteLayout,
});

function AdminRouteLayout() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
