import { Link, useLocation } from "@tanstack/react-router";
import { Compass, Repeat2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils/cn";
import {
  authenticatedNavItems,
  navItemIsActive,
  type AuthenticatedNavItem,
} from "./authenticated-nav";

/**
 * The authenticated sidebar.
 *
 * Rendered only from `lg:` up; on smaller screens the same role-aware entries
 * appear in the mobile nav sheet (`MobileAuthenticatedNav`) — both read the one
 * shared list in `authenticated-nav.ts`. The active route comes from
 * `useLocation()`, the router's own subscription, so the highlight moves on a
 * client-side navigation rather than reading the global `location`.
 */
export function AuthenticatedSidebar() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const items = authenticatedNavItems(user?.role);

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[var(--divider)] bg-background lg:flex">
      <div className="flex h-[76px] shrink-0 items-center gap-3 px-6">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Revaro — your dashboard"
        >
          <span className="soft-button flex size-10 items-center justify-center rounded-2xl text-primary">
            <Repeat2 size={19} strokeWidth={2.5} />
          </span>
          <span className="font-heading text-lg font-extrabold tracking-tight">Revaro</span>
        </Link>
      </div>

      <nav aria-label="Workspace" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item) => (
          <NavRow key={item.to} item={item} active={navItemIsActive(pathname, item.to)} />
        ))}
      </nav>

      <div className="border-t border-[var(--divider)] p-3">
        <Link
          to="/"
          className="flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <Compass size={14} aria-hidden />
          Back to the storefront
        </Link>
      </div>
    </aside>
  );
}

function NavRow({ item, active }: { item: AuthenticatedNavItem; active: boolean }) {
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-primary/8 hover:text-foreground",
      )}
    >
      <item.icon size={17} aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}