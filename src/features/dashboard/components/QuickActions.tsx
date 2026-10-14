import { Link } from "@tanstack/react-router";
import {
  ClipboardList,
  Compass,
  Heart,
  Package,
  PlusCircle,
  Repeat2,
  ShieldCheck,
  ShoppingBag,
  Store,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { isSellerRole } from "@/features/auth/types";

/**
 * Role-aware quick actions. These are presentation shortcuts into real routes —
 * the access control that matters happens behind them (the routes are guarded,
 * the sellers' endpoints are `SELLER_REQUIRED`, the admin route is
 * `requireAdmin`), so showing a seller a "Sell" action is convenience, not a
 * security decision.
 */

type Action = {
  to: string;
  label: string;
  icon: typeof Compass;
};

const CUSTOMER_ACTIONS: Action[] = [
  { to: "/browse", label: "Browse products", icon: Compass },
  { to: "/orders", label: "My orders", icon: ShoppingBag },
  { to: "/rentals", label: "My rentals", icon: Repeat2 },
  { to: "/favorites", label: "Favorites", icon: Heart },
];

const SELLER_ACTIONS: Action[] = [
  { to: "/seller/products/new", label: "Create listing", icon: PlusCircle },
  { to: "/seller/products", label: "Manage listings", icon: Package },
  { to: "/seller/orders", label: "Seller orders", icon: ClipboardList },
  { to: "/seller/rentals", label: "Seller rentals", icon: Repeat2 },
];

export function QuickActions() {
  const { user } = useAuth();

  // An admin is also a seller role (`CLIENT_SELLER_ROLES` is `SELLER | ADMIN`), so
  // the old `isSellerRole ? … : role === "ADMIN" ? …` ternary made the admin branch
  // unreachable — an admin's dashboard offered the seller tools and never the admin
  // workspace. The two doors are now composed independently, because "may open the
  // admin workspace" and "may open the seller workspace" are different questions.
  const isSeller = isSellerRole(user?.role);
  const isAdmin = user?.role === "ADMIN";

  const actions: Action[] = [
    ...(isAdmin ? [{ to: "/admin", label: "Open Admin workspace", icon: ShieldCheck }] : []),
    ...(isSeller ? [{ to: "/seller", label: "Open Seller workspace", icon: Store }] : []),
    ...(isSeller ? SELLER_ACTIONS : CUSTOMER_ACTIONS),
  ];

  return (
    <section aria-label="Quick actions" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {actions.map((action) => (
        <Link
          key={action.to}
          to={action.to}
          className="card-surface flex items-center gap-3 rounded-3xl p-4 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="soft-button flex size-10 shrink-0 items-center justify-center rounded-2xl text-primary">
            <action.icon size={17} aria-hidden />
          </span>
          <span className="text-sm font-bold leading-tight">{action.label}</span>
        </Link>
      ))}
    </section>
  );
}