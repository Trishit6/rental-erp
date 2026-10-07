import { useState } from "react";
import { Outlet } from "@tanstack/react-router";
import { CartDrawerHost } from "@/features/cart";
import { GoToTop } from "@/components/shared/GoToTop";
import { FloatingRail } from "@/lib/floating/rail";
import { AuthenticatedSidebar } from "./AuthenticatedSidebar";
import { AuthenticatedTopbar } from "./AuthenticatedTopbar";
import { MobileAuthenticatedNav } from "./MobileAuthenticatedNav";

/**
 * The authenticated workspace chrome.
 *
 * `Sidebar | Topbar + Main` on desktop; on mobile the sidebar is a bottom-sheet
 * menu opened from the topbar, and everything stacks in one column. The content
 * pages render into `<Outlet />` with their own padding — a dashboard uses
 * `page-wrap` like the storefront, so it keeps the same breathing room.
 *
 * Fixed overhangs live here rather than at the root: the root layout hides the
 * storefront's floating rail, go-to-top and cart host whenever a workspace route
 * matches, so this shell re-mounts them for its own column. The providers they
 * need (cart drawer, floating rail) wrap the whole app, so nothing is lost.
 */
export function AuthenticatedLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <div className="flex min-h-screen bg-background">
        <AuthenticatedSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <AuthenticatedTopbar onMenuClick={() => setMobileNavOpen(true)} />
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      <MobileAuthenticatedNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

      {/* The shared bottom-right corner, present on workspace pages too. */}
      <FloatingRail />
      <GoToTop />
      <CartDrawerHost />
    </div>
  );
}