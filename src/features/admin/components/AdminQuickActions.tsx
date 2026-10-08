import type { LucideIcon } from "lucide-react";
import { CreditCard, Handshake, Package, ShoppingCart, Store, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

/**
 * The dashboard's six quick actions.
 *
 * Every tile is a real route in the workspace — this is a launcher for things that
 * actually exist, so the list matches the modules, and adding a module means adding
 * its tile here (and to the sidebar; see the sidebar's own comment about drift).
 */
const QUICK_ACTIONS: { label: string; description: string; to: string; icon: LucideIcon }[] = [
  { label: "Manage Products", description: "Catalogue, filters, bulk status", to: "/admin/products", icon: Package },
  { label: "Manage Users", description: "Accounts, roles, suspension", to: "/admin/users", icon: Users },
  { label: "Manage Orders", description: "Every purchase, any status", to: "/admin/orders", icon: ShoppingCart },
  { label: "Manage Rentals", description: "Bookings, stages, returns", to: "/admin/rentals", icon: Handshake },
  { label: "Manage Sellers", description: "Verification and payouts", to: "/admin/sellers", icon: Store },
  { label: "View Payments", description: "The per-transaction ledger", to: "/admin/payments", icon: CreditCard },
];

export function AdminQuickActions() {
  return (
    <section aria-labelledby="quick-actions-title" className="space-y-3">
      <h2 id="quick-actions-title" className="text-sm font-extrabold uppercase tracking-wider">
        Quick actions
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {QUICK_ACTIONS.map(({ label, description, to, icon: Icon }) => (
          <Link
            key={label}
            to={to}
            className="group rounded-2xl border border-[var(--divider)] bg-background p-4 transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Card className="flex items-start gap-3 border-0 p-0 shadow-none">
              <span className="soft-button flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
                <Icon size={17} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold">{label}</span>
                <span className="block text-xs text-muted-foreground">{description}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}