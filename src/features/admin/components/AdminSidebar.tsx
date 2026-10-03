import type { LucideIcon } from "lucide-react";
import {
  BadgeIndianRupee,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  MessageSquareQuote,
  Package,
  RefreshCcw,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Truck,
  Undo2,
  UserCog,
  Users,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";

/**
 * The admin sidebar.
 *
 * ## The whole navigation tree is declared here, built or not
 *
 * The spec asks for the full section structure, so it is written out in full and
 * each entry declares whether it exists yet. Unbuilt sections render as inert rows
 * with a "Soon" tag instead of being omitted or linked.
 *
 * That choice is deliberate. Omitting them would make the admin workspace look
 * finished while hiding that orders, finance and payouts have no surface — and the
 * someone deciding what to build next would have no list to decide from. Linking
 * them would produce 404s. Disabling them is the only option that is both honest
 * and non-broken, and it means turning one on later is a one-word change.
 */

export type AdminNavItem = {
  label: string;
  /** Present only when the destination actually exists. */
  to?: string;
  icon: LucideIcon;
};

export type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", to: "/admin", icon: LayoutDashboard }],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", to: "/admin/products", icon: Package },
      { label: "Categories", icon: Tag },
      { label: "Product images", icon: ImageIcon },
    ],
  },
  {
    title: "Orders",
    items: [
      { label: "All orders", icon: ClipboardList },
      { label: "Purchases", icon: ShoppingBag },
      { label: "Rentals", icon: RefreshCcw },
      { label: "Returns", icon: Undo2 },
      { label: "Refunds", icon: RotateCcw },
    ],
  },
  {
    title: "Users",
    items: [
      { label: "Customers", to: "/admin/moderation", icon: Users },
      { label: "Sellers", icon: Store },
    ],
  },
  {
    title: "Marketplace",
    items: [
      { label: "Listings", to: "/admin/products", icon: Building2 },
      { label: "Pre-loved", icon: Building2 },
      { label: "Rent-to-own", icon: Truck },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Revenue", icon: BadgeIndianRupee },
      { label: "Transactions", icon: CreditCard },
      { label: "Payouts", icon: Gauge },
      { label: "Refunds", icon: RotateCcw },
    ],
  },
  {
    title: "Reviews",
    items: [
      { label: "Product reviews", to: "/admin/moderation", icon: MessageSquareQuote },
      { label: "Seller reviews", icon: MessageSquareQuote },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Moderation", to: "/admin/moderation", icon: ShieldCheck },
      { label: "Analytics", icon: BarChart3 },
      { label: "Admin profile", icon: UserCog },
      { label: "Settings", icon: Settings },
    ],
  },
];

function NavRow({ item, onNavigate }: { item: AdminNavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const base =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors";
  const inactive = `${base} text-muted-foreground hover:bg-muted/60 hover:text-foreground`;
  // An inert row rather than a link to nowhere. `aria-disabled` keeps it announced
  // as unavailable; it is not focusable, so there is nothing to activate.
  const disabled = `${base} cursor-not-allowed text-muted-foreground/50`;

  const content = (
    <>
      <Icon size={16} aria-hidden className="shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      {item.to ? null : (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
          Soon
        </span>
      )}
    </>
  );

  if (!item.to) {
    return (
      <span className={disabled} aria-disabled="true" title={`${item.label} — not built yet`}>
        {content}
      </span>
    );
  }

  // Exact match for the dashboard, prefix match for the sections, so "Products"
  // stays lit while a nested route under it is open.
  const isActive =
    item.to === "/admin"
      ? pathname === "/admin"
      : pathname === item.to || pathname.startsWith(`${item.to}/`);

  return (
    <Link
      to={item.to}
      className={cn(isActive ? `${base} bg-primary/10 text-primary` : inactive)}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin sections" className="space-y-5">
      {ADMIN_NAV.map((section) => (
        <div key={section.title}>
          <h2 className="px-3 text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
            {section.title}
          </h2>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => (
              <li key={`${section.title}-${item.label}`}>
                <NavRow item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The rail of section headings, for the collapsible mobile drawer. */
export function AdminSidebarFooter() {
  return (
    <p className="px-3 text-[11px] leading-relaxed text-muted-foreground/80">
      <FileText size={12} aria-hidden className="mb-1 inline" /> Rows come from the database.
      Financial history is never edited here.
    </p>
  );
}
