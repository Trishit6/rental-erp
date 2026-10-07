import { useAuth } from "@/lib/auth/auth-context";
import { isSellerRole } from "@/features/auth/types";
import { DashboardPage as SellerDashboardPage } from "@/features/seller-dashboard";
import { ActiveRentals } from "./components/ActiveRentals";
import { AdminOverviewPanel } from "./components/AdminOverviewPanel";
import { CartSummary } from "./components/CartSummary";
import { DashboardHeader } from "./components/DashboardHeader";
import { DashboardStats } from "./components/DashboardStats";
import { FavoriteProducts } from "./components/FavoriteProducts";
import { QuickActions } from "./components/QuickActions";
import { RecentActivity } from "./components/RecentActivity";
import { RecentOrders } from "./components/RecentOrders";
import { RecommendedProducts } from "./components/RecommendedProducts";

/**
 * `/dashboard` — the authenticated workspace home, adapted to the signed-in
 * role by the session (never by anything the client sends):
 *
 *  - a customer sees their marketplace — orders, rentals, favourites, cart,
 *    recommendations and activity, all from real endpoints;
 *  - a seller sees their sales overview — the same `DashboardPage` the seller
 *    workspace renders, so there is exactly one seller dashboard, not two;
 *  - an admin sees real platform figures plus the entry point to `/admin`.
 *
 * Every number on the page is server-derived; every card shows a skeleton while
 * its section loads and an honest empty or error state rather than a fake zero.
 */
export function DashboardPage() {
  const { user } = useAuth();

  // `isSellerRole` covers ADMIN too (the back end lets administrators act as
  // sellers), so the admin branch must be checked *first*: an admin's `/dashboard`
  // is the platform overview, with the seller overview one workspace away.
  if (user?.role === "ADMIN") {
    return (
      <div className="page-wrap space-y-7 pb-12 pt-8">
        <DashboardHeader
          actions={[{ to: "/admin", label: "Open Admin Workspace" }, { to: "/browse", label: "Browse products" }]}
        />
        <AdminOverviewPanel />
      </div>
    );
  }

  if (isSellerRole(user?.role)) {
    return <SellerDashboardPage />;
  }

  return (
    <div className="page-wrap space-y-7 pb-12 pt-8">
      <DashboardHeader />
      <QuickActions />
      <DashboardStats />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentOrders />
        <ActiveRentals />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FavoriteProducts />
        <CartSummary />
      </div>

      <RecommendedProducts />
      <RecentActivity />
    </div>
  );
}