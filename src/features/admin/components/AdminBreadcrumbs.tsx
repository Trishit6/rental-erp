import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

/**
 * The admin breadcrumbs: `Admin / Products`, `Admin / Orders / …`.
 *
 * ## Why the trail is a pure function
 *
 * The mapping from a pathname to "Admin / Reviews / Seller engagement" is the kind of
 * thing that drifts the moment it is inlined into JSX — the sidebar changes a label
 * and the breadcrumbs keep the old one, because nobody looks at both. Splitting the
 * mapping out means the tests can pin it directly, and the component stays a dumb
 * renderer over that contract.
 *
 * The labels deliberately mirror the sidebar's entries: the breadcrumb and the nav
 * describe the same workspace, so a label difference here would be a bug, not a
 * feature.
 */

const CRUMB_LABELS: Record<string, string> = {
  "": "Dashboard",
  products: "Products",
  categories: "Categories",
  "product-images": "Product images",
  orders: "Orders",
  purchases: "Purchases",
  rentals: "Rentals",
  returns: "Returns",
  users: "Users",
  sellers: "Sellers",
  payments: "Payments",
  refunds: "Refunds",
  finance: "Finance",
  reviews: "Reviews",
  reports: "Reports",
  moderation: "Moderation",
  notifications: "Notifications",
  settings: "Settings",
  "audit-logs": "Audit logs",
};

/** One step of the trail. `to` is absent on the current (last) crumb. */
export type AdminCrumb = { label: string; to?: string };

/** `"/admin/reviews/sellers"` → `Admin / Reviews / Seller engagement`. */
export function adminBreadcrumbTrail(pathname: string): AdminCrumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "admin") return [];
  const rest = segments.slice(1);

  const trail: AdminCrumb[] = [];
  let path = "/admin";

  rest.forEach((segment, index) => {
    path = `${path}/${segment}`;
    let label = CRUMB_LABELS[segment] ?? segment;
    // The reviews section nests the seller-engagement page; the two pages are not
    // "Reviews > Sellers" as a reader would read it, so the second level carries its
    // own label rather than the plural table name.
    if (segment === "sellers" && rest[0] === "reviews") label = "Seller engagement";
    const isLast = index === rest.length - 1;
    trail.push({ label, to: isLast ? undefined : path });
  });

  // The workspace root. It is a crumb even on the dashboard itself — "Admin" is the
  // home of the whole surface, and the dashboard reads as its first page.
  return trail.length === 0 ? [{ label: "Admin" }] : [{ label: "Admin", to: "/admin" }, ...trail];
}

export function AdminBreadcrumbs() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const trail = adminBreadcrumbTrail(pathname);

  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumbs" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={`${index}-${crumb.label}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight
                  size={14}
                  aria-hidden
                  className="shrink-0 text-muted-foreground/50"
                />
              ) : null}
              {crumb.to && !isLast ? (
                <Link
                  to={crumb.to}
                  className="truncate font-semibold text-muted-foreground transition hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-extrabold" aria-current={isLast ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}