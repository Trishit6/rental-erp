import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { LayoutGrid, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { AdminSidebar, AdminSidebarFooter } from "./AdminSidebar";

/**
 * The admin workspace shell.
 *
 * ## Why the sidebar is a column on desktop and a sheet on mobile
 *
 * A 220px rail of eight section groups does not fit beside a product catalogue on a
 * phone. Rather than let it push the table off-screen — the failure that makes an
 * admin page unusable on a handset — the rail becomes a bottom sheet behind a
 * "Sections" button below `lg`, and the content column takes the full width. The
 * sheet is the project's existing Radix-backed component, so focus trapping, escape
 * and `aria-modal` are already correct.
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

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile bar */}
      <header className="sticky top-0 z-[var(--layer-header)] border-b border-[var(--divider)] bg-background/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="soft-button flex size-9 items-center justify-center rounded-xl text-primary">
              <ShieldCheck size={17} aria-hidden />
            </span>
            <span className="font-heading text-base font-extrabold">Admin</span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNavOpen(true)}
            aria-haspopup="dialog"
          >
            <LayoutGrid size={16} aria-hidden />
            Sections
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] gap-8 px-4 py-6 lg:px-8 lg:py-8">
        {/* Desktop rail */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">
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
