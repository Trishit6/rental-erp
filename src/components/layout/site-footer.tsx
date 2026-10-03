import { Link } from "@tanstack/react-router";
import { Repeat2 } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="page-wrap pb-8 pt-10">
      <div className="soft-surface flex flex-col gap-5 rounded-3xl px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-3">
          <span className="soft-button flex size-10 items-center justify-center rounded-xl text-primary">
            <Repeat2 size={18} />
          </span>
          <span className="font-heading font-extrabold">Revaro</span>
          <span className="text-xs text-muted-foreground">© 2026 · Rent. Buy. Sell. Reuse.</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground">
          <Link to="/how-it-works" className="nav-link">
            Trust &amp; insurance
          </Link>
          <Link to="/list" className="nav-link">
            Seller handbook
          </Link>
          <Link to="/how-it-works" className="nav-link">
            Help
          </Link>
        </nav>
      </div>
    </footer>
  );
}
