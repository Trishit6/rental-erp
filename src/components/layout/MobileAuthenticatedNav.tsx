import { Link, useLocation } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils/cn";
import { authenticatedNavItems, navItemIsActive } from "./authenticated-nav";

/**
 * The mobile navigation: a bottom sheet with the same role-aware entries the
 * desktop sidebar shows. Each entry navigates and closes the sheet in one tap —
 * no second gesture to dismiss a drawer before the page is visible — and the
 * sheet is a Radix dialog, so it traps focus, closes on Escape and has an
 * accessible label.
 */
export function MobileAuthenticatedNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const items = authenticatedNavItems(user?.role);

  function close() {
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Menu"
      description="Your Revaro workspace"
    >
      <nav aria-label="Workspace" className="flex flex-col gap-0.5 pb-2">
        {items.map((item) => {
          const active = navItemIsActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={close}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-primary/8",
              )}
            >
              <item.icon size={17} aria-hidden />
              <span>{item.label}</span>
              {active && <span className="sr-only">(current)</span>}
            </Link>
          );
        })}
      </nav>

      <Link
        to="/"
        onClick={close}
        className="mt-2 flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <Compass size={15} aria-hidden />
        Back to the storefront
      </Link>
    </Sheet>
  );
}