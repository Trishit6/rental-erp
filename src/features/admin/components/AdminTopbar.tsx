import { Link } from "@tanstack/react-router";
import { LayoutGrid, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminNotificationsBell } from "./AdminNotificationsBell";
import { AdminProfileMenu } from "./AdminProfileMenu";
import { AdminSearch } from "./AdminSearch";

/**
 * The admin workspace's topbar — one bar for every breakpoint.
 *
 * Desktop and mobile get the same anatomy ("professional control surface" reads the
 * same on a 1440px screen and a 360px handset): brand, breadcrumbs, search,
 * notifications and identity. What changes is what has room:
 *
 *  - the breadcrumbs hide below `md` (the current section is obvious from the page);
 *  - the sections toggle shows below `lg`, where the rail itself is hidden and
 *    navigation lives in the drawer it opens;
 *  - the wordmark hides below `sm`, leaving the shield mark to anchor the bar.
 */
export function AdminTopbar({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="sticky top-0 z-[var(--layer-header)] border-b border-[var(--divider)] bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-2 px-4 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenNav}
          aria-haspopup="dialog"
          className="lg:hidden"
        >
          <LayoutGrid size={16} aria-hidden />
          <span className="text-xs font-bold">Sections</span>
        </Button>

        <Link to="/admin" className="flex shrink-0 items-center gap-2" aria-label="Admin dashboard">
          <span className="soft-button flex size-9 items-center justify-center rounded-xl text-primary">
            <ShieldCheck size={17} aria-hidden />
          </span>
          <span className="hidden font-heading text-base font-extrabold md:block">Admin</span>
        </Link>

        <div className="hidden min-w-0 flex-1 md:block">
          <AdminBreadcrumbs />
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <AdminSearch />
          <AdminNotificationsBell />
          <AdminProfileMenu />
        </div>
      </div>
    </header>
  );
}