import type { LucideIcon } from "lucide-react";
import {
  BadgeIndianRupee,
  ClipboardList,
  CreditCard,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  MessageSquareQuote,
  Package,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Undo2,
  Users,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils/cn";

/**
 * The admin sidebar.
 *
 * ## Every row is a link
 *
 * An earlier version of this declared the whole section tree the spec asks for and marked
 * the unbuilt parts "Soon", rendering them as inert rows. That was honest about what did
 * not exist and dishonest about the current state: it invited the reading that orders,
 * finance and payouts *had* no surface, which stopped being true. Every entry here now
 * resolves to a route, so the workspace's shape and the routes' shape cannot drift —
 * adding a section means adding the page and the link together.
 *
 * The "Soon" affordance is kept because it is still the right answer for a section that
 * has no server data behind it yet: a disabled row says "not built", a link to nowhere
 * says "broken", and silently omitting it says nothing at all. None are currently in use,
 * and that is deliberate rather than accidental.
 *
 * ## Two entries were removed rather than linked
 *
 * - **Listings / Pre-loved / Rent-to-own** duplicated "Products". All three are the same
 *   catalogue with a different `listingType` filter, so three sidebar rows pointed at one
 *   page. The catalogue's own type filter is the honest way to reach them, and one row
 *   that goes where the data is beats three that go to the same place.
 * - **Refunds** appeared twice, under both Orders and Finance. A duplicate navigation
 *   entry makes people wonder whether the two pages differ; they were the same request.
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
    items: [
      { label: "Dashboard", to: "/admin", icon: LayoutDashboard },
      { label: "Finance", to: "/admin/finance", icon: BadgeIndianRupee },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", to: "/admin/products", icon: Package },
      { label: "Categories", to: "/admin/categories", icon: Tag },
      { label: "Product images", to: "/admin/product-images", icon: ImageIcon },
    ],
  },
  {
    title: "Orders",
    items: [
      { label: "All orders", to: "/admin/orders", icon: ClipboardList },
      { label: "Purchases", to: "/admin/purchases", icon: ShoppingBag },
      { label: "Rentals", to: "/admin/rentals", icon: RefreshCcw },
      { label: "Returns", to: "/admin/returns", icon: Undo2 },
    ],
  },
  {
    title: "Users",
    items: [
      { label: "Customers", to: "/admin/users", icon: Users },
      { label: "Sellers", to: "/admin/sellers", icon: Store },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Payments", to: "/admin/payments", icon: CreditCard },
      { label: "Refunds", to: "/admin/refunds", icon: RotateCcw },
    ],
  },
  {
    title: "Reviews",
    items: [
      { label: "Product reviews", to: "/admin/reviews", icon: MessageSquareQuote },
      { label: "Seller engagement", to: "/admin/reviews/sellers", icon: MessageSquareQuote },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Moderation", to: "/admin/moderation", icon: ShieldCheck },
      { label: "Audit log", to: "/admin/audit-log", icon: FileText },
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
