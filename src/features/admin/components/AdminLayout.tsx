import type { ReactNode } from "react";
import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Sheet } from "@/components/ui/sheet";
import { AdminSidebar, AdminSidebarFooter } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

/**
 * The admin workspace shell.
 *
 * ## The two render modes
 *
 * Every `/admin/*` route gets the shell: a topbar (brand, breadcrumbs, search,
 * notifications, profile) and a sidebar rail on desktop that becomes a sections
 * drawer below `lg`.
 *
 * One route escapes the shell: `/admin/forbidden`. A signed-in non-admin who opens
 * the workspace sees a bare 403 page on purpose — no sidebar listing the sections
 * they are being refused, no profile menu, no navigation that would just bounce them
 * again. The guard lets exactly that path through for an authenticated non-admin
 * (`requireAdmin`), and this layout renders it without chrome.
 *
 * ## Why the sidebar is a column on desktop and a sheet on mobile
 *
 * A 220px rail of section groups does not fit beside a product catalogue on a
 * phone. Rather than let it push the table off-screen — the failure that makes an
 * admin page unusable on a handset — the rail becomes a bottom sheet behind the
 * topbar's "Sections" button below `lg`, and the content column takes the full
 * width. The sheet is the project's existing Radix-backed component, so focus
 * trapping, escape and `aria-modal` are already correct.
 *
 * ## Why this chrome is only here
 *
 * `/admin` deliberately does not render the customer `SiteHeader`, `SiteFooter`,
 * floating rail, or go-to-top; the root layout skips them for this subtree
 * (§"completely separate from the normal customer-facing navigation"). A seller
 * browsing their own dashboard has no business in the moderation queue's chrome, and
 * an administrator does not need a cart.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = useLocation({ select: (location) => location.pathname });

  if (pathname === "/admin/forbidden") {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminTopbar onOpenNav={() => setNavOpen(true)} />

      <div className="mx-auto flex w-full max-w-[1600px] gap-8 px-4 py-6 lg:px-8 lg:py-8">
        {/* Desktop rail */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
            <AdminSidebar />
            <div className="mt-6 border-t border-[var(--divider)] pt-4">
              <AdminSidebarFooter />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      <Sheet
        open={navOpen}
        onOpenChange={setNavOpen}
        title="Admin sections"
        description="Jump to a part of the workspace."
      >
        {/* Navigating closes the sheet; otherwise it covers the page you just asked for. */}
        <AdminSidebar onNavigate={() => setNavOpen(false)} />
      </Sheet>
    </div>
  );
}

/**
 * Standard page header for a workspace section.
 *
 * One component so every section reads the same way, and so `eyebrow` /
 * `section-title` keep doing the typographic work rather than each page inventing
 * its own heading sizes.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="section-title mt-1 text-2xl sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}