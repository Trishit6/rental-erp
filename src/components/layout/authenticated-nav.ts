import {
  Bell,
  CalendarRange,
  ClipboardList,
  Compass,
  Heart,
  LayoutDashboard,
  MessageCircle,
  Package,
  Repeat2,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { isSellerRole } from "@/features/auth/types";
import type { AuthRole } from "@/features/auth/types";

/**
 * The authenticated navigation list, shared by the desktop sidebar and the
 * mobile nav sheet so the two can never disagree about what a role may reach.
 * The routes themselves stay guarded by `requireAuth` (the layout) and the
 * server — listing an item is presentation, not access control.
 */

export type AuthenticatedNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const CORE_ITEMS: AuthenticatedNavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/browse", label: "Browse", icon: Compass },
  { to: "/orders", label: "My Orders", icon: ShoppingBag },
  { to: "/rentals", label: "My Rentals", icon: Repeat2 },
  { to: "/favorites", label: "Favorites", icon: Heart },
  { to: "/cart", label: "Cart", icon: ShoppingCart },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "Profile", icon: UserIcon },
  { to: "/settings", label: "Settings", icon: Settings },
];

const SELLER_ITEMS: AuthenticatedNavItem[] = [
  { to: "/seller", label: "Seller Workspace", icon: Store },
  { to: "/seller/products", label: "My Listings", icon: Package },
  { to: "/seller/orders", label: "Seller Orders", icon: ClipboardList },
  { to: "/seller/rentals", label: "Seller Rentals", icon: CalendarRange },
];

/**
 * Role-aware entries. Customers see the core set; sellers gain the workspace
 * group. Admins ride on the same `isSellerRole` convention the back end uses
 * (they may act as sellers) *and* gain the admin entry, whose route remains
 * `requireAdmin`-guarded server-side — this list only decides what gets
 * rendered.
 */
export function authenticatedNavItems(role: AuthRole | undefined): AuthenticatedNavItem[] {
  const items = [...CORE_ITEMS];
  if (isSellerRole(role)) {
    items.push(...SELLER_ITEMS);
  }
  if (role === "ADMIN") {
    items.push({ to: "/admin", label: "Admin Workspace", icon: ShieldCheck });
  }
  return items;
}

/** Exact match for `/dashboard`/`/seller`, prefix match for the rest. */
export function navItemIsActive(pathname: string, to: string): boolean {
  if (to === "/dashboard") return pathname === to || pathname === "/dashboard/";
  if (to === "/seller") return pathname === to || pathname === "/seller/";
  return pathname === to || pathname.startsWith(`${to}/`);
}