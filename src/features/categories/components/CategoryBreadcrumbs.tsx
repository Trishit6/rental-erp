import { Link } from "@tanstack/react-router";
import { ChevronRight, House } from "lucide-react";
import type { CategoryDetail } from "../types";

type Crumb = { label: string; slug?: string };

/**
 * Home / Categories / Electronics / Cameras.
 *
 * Every crumb except the last is a TanStack Router `Link`, so navigation is
 * client-side (no full-page reloads) and middle-click/new-tab still work. The
 * current page is marked `aria-current="page"` and is not a link.
 */
export function CategoryBreadcrumbs({ category }: { category: CategoryDetail }) {
  const crumbs: Crumb[] = [{ label: "Categories" }];
  if (category.parent) crumbs.push({ label: category.parent.name, slug: category.parent.slug });
  crumbs.push({ label: category.name, slug: category.slug });

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <li>
          <Link
            to="/"
            className="inline-flex items-center gap-1 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <House size={13} aria-hidden />
            Home
          </Link>
        </li>

        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              <ChevronRight size={12} aria-hidden className="text-muted-foreground/60" />
              {isLast ? (
                <span aria-current="page" className="font-bold text-foreground">
                  {crumb.label}
                </span>
              ) : index === 0 ? (
                <Link
                  to="/categories"
                  className="transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {crumb.label}
                </Link>
              ) : (
                <Link
                  to="/categories/$categorySlug"
                  params={{ categorySlug: crumb.slug! }}
                  className="transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Breadcrumbs for a page that has no category yet (the categories index). */
export function CategoriesBreadcrumbs() {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <li>
          <Link
            to="/"
            className="inline-flex items-center gap-1 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <House size={13} aria-hidden />
            Home
          </Link>
        </li>
        <li className="flex items-center gap-1.5">
          <ChevronRight size={12} aria-hidden className="text-muted-foreground/60" />
          <span aria-current="page" className="font-bold text-foreground">
            Categories
          </span>
        </li>
      </ol>
    </nav>
  );
}
