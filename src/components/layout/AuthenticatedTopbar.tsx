import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { CartDrawerTrigger } from "@/features/cart/components/CartDrawerTrigger";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { ThemeToggle } from "@/lib/theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthenticatedProfileMenu } from "./AuthenticatedProfileMenu";

/**
 * The authenticated topbar: search, theme, notifications, cart and the profile
 * control. Compact on mobile (a menu button opens the nav sheet), full-width on
 * desktop beside the sidebar.
 */
export function AuthenticatedTopbar({ onMenuClick }: { onMenuClick: () => void }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void navigate({ to: "/browse", search: { search: query.trim() || undefined } });
  }

  return (
    <header className="sticky top-0 z-[var(--layer-header)] border-b border-white/70 bg-background/90 backdrop-blur-xl transition-all duration-300 dark:border-white/5">
      <div className="flex h-[72px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu size={19} aria-hidden />
        </Button>

        <form className="relative w-full max-w-md" onSubmit={search} role="search">
          <Search
            size={16}
            aria-hidden
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search listings"
            className="h-10 pl-10 pr-3"
            placeholder="Search anything..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </form>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {user && (
            <span className="hidden sm:block">
              <RoleBadge role={user.role} />
            </span>
          )}
          <NotificationBell enabled={!!user} />
          <CartDrawerTrigger />
          <AuthenticatedProfileMenu />
        </div>
      </div>
    </header>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label = role === "ADMIN" ? "Admin" : role === "SELLER" ? "Seller" : "Customer";
  return <Badge>{label}</Badge>;
}