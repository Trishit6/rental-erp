import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils/cn";

/**
 * The top of the dashboard: a personalised welcome plus the actions a visitor
 * is most likely to reach for. The name is the session user's — never a
 * hardcoded one — and the actions are plain anchors so they are reachable by
 * keyboard, prefetch on hover and open in a new tab if asked.
 */

type QuickLink = {
  to: string;
  label: string;
};

const CUSTOMER_LINKS: QuickLink[] = [
  { to: "/browse", label: "Browse products" },
  { to: "/orders", label: "View orders" },
  { to: "/rentals", label: "View rentals" },
];

export function DashboardHeader({ actions }: { actions?: QuickLink[] }) {
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";
  const links = actions ?? CUSTOMER_LINKS;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">
          Welcome back, {firstName} <span aria-hidden>👋</span>
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Here&apos;s what&apos;s happening with your Revaro account.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={cn(
              "soft-button inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors",
              "text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            )}
          >
            {link.label}
            <ChevronRight size={13} aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}