import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Repeat2,
  Search,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../lib/api/client";
import { queryKeys } from "../../lib/query/keys";
import { useAuth } from "../../lib/auth/auth-context";
import { useLogoutMutation } from "@/features/auth/query";
import { CartDrawerTrigger } from "@/features/cart/components/CartDrawerTrigger";
import { ThemeToggle } from "@/lib/theme";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { NotificationItem } from "../../lib/types";

type NotificationList = { items: NotificationItem[]; unread: number };

export function SiteHeader() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Navbar elevation on scroll: more opaque, stronger shadow.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The notifications poll is the header's own concern. The cart badge is NOT:
  // it lives in `CartDrawerTrigger`, reading the one shared cart entry, so the
  // header can never show a different count than the cart page.
  const { data: notifications } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: async () => {
      try {
        const { data } = await api.get<NotificationList>("/notifications");
        return data;
      } catch {
        return { items: [], unread: 0 };
      }
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ to: "/browse", search: { search: query.trim() || undefined } });
    setMenuOpen(false);
  }

  const logoutMutation = useLogoutMutation();

  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync();
      toast("Signed out. See you soon!");
      void navigate({ to: "/" });
    } catch {
      toast("Couldn't sign out. Please try again.");
    }
  }

  const unreadCount = notifications?.unread ?? 0;

  return (
    <header
      className={`sticky top-0 z-30 border-b border-white/70 bg-background/90 backdrop-blur-xl transition-all duration-300 dark:border-white/5 ${
        scrolled ? "shadow-[0_6px_24px_var(--shadow-color-dark)]" : ""
      }`}
    >
      <div className="page-wrap flex h-[76px] items-center justify-between gap-5">
        <Link to="/" className="flex shrink-0 items-center gap-3">
          <span className="soft-button flex size-11 items-center justify-center rounded-2xl text-primary">
            <Repeat2 size={21} strokeWidth={2.5} />
          </span>
          <span className="font-heading text-xl font-extrabold tracking-tight">Revaro</span>
          <span className="soft-button hidden rounded-full px-3 py-1 text-[11px] font-semibold text-muted-foreground sm:block">
            Rent. Buy. Sell. Reuse.
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-semibold lg:flex">
          <Link to="/browse" className="nav-link">
            Browse
          </Link>
          <Link to="/browse" search={{ mode: "rent" }} className="nav-link">
            Rentals
          </Link>
          <Link to="/pre-loved" className="nav-link">
            Pre-loved
          </Link>
          <Link to="/how-it-works" className="nav-link">
            How it works
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <form className="relative w-56" onSubmit={search} role="search">
            <Search
              size={16}
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
          <ThemeToggle />
          <Button asChild variant="secondary" size="icon" aria-label="Saved items">
            <Link to="/favorites">
              <Heart size={18} />
            </Link>
          </Button>
          {/* Opens the cart drawer in place, so checking the cart never costs the
              page you are on. Its badge is the shared cart count. */}
          <CartDrawerTrigger />
          {user ? (
            <>
              <div className="relative">
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Notifications"
                  aria-expanded={notifOpen}
                  className="relative"
                  onClick={() => setNotifOpen((open) => !open)}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                      {unreadCount}
                    </span>
                  )}
                </Button>
                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className="raised-surface absolute right-0 top-12 z-50 max-h-96 w-80 overflow-y-auto rounded-2xl p-3"
                    >
                      <div className="flex items-center justify-between px-2 pb-2">
                        <span className="text-sm font-extrabold">Notifications</span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary hover:underline"
                          onClick={async () => {
                            await api.post("/notifications/read-all");
                            void queryClient.invalidateQueries({
                              queryKey: queryKeys.notifications,
                            });
                          }}
                        >
                          Mark all read
                        </button>
                      </div>
                      {notifications?.items.length ? (
                        notifications.items.slice(0, 10).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setNotifOpen(false);
                              if (item.link) void navigate({ to: item.link });
                            }}
                            className={`block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-primary/5 ${
                              item.readAt ? "" : "bg-primary/5"
                            }`}
                          >
                            <p className="font-bold">{item.title}</p>
                            {item.body && (
                              <p className="text-xs text-muted-foreground">{item.body}</p>
                            )}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No notifications yet.
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Button asChild>
                <Link to="/dashboard">
                  <LayoutDashboard size={15} />
                  <span>Dashboard</span>
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild>
                <Link to="/list">
                  <span>Sell an item</span>
                  <ArrowRight size={15} />
                </Link>
              </Button>
            </>
          )}
        </div>

        <button
          className="soft-button flex size-10 items-center justify-center rounded-full md:hidden"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden md:hidden"
          >
            <div className="page-wrap flex flex-col gap-3 pb-5">
              <form className="relative" onSubmit={search} role="search">
                <Search
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Search listings"
                  className="pl-10"
                  placeholder="Search anything..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </form>
              <div className="flex items-center justify-between py-1">
                <span className="eyebrow">Theme</span>
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                </div>
              </div>
              <Link to="/browse" className="nav-link py-2" onClick={() => setMenuOpen(false)}>
                Browse everything
              </Link>
              <Link
                to="/browse"
                search={{ mode: "rent" }}
                className="nav-link py-2"
                onClick={() => setMenuOpen(false)}
              >
                Rentals
              </Link>
              <Link to="/pre-loved" className="nav-link py-2" onClick={() => setMenuOpen(false)}>
                Pre-loved
              </Link>
              <Link to="/favorites" className="nav-link py-2" onClick={() => setMenuOpen(false)}>
                Favorites
              </Link>
              <Link to="/cart" className="nav-link py-2" onClick={() => setMenuOpen(false)}>
                Cart
              </Link>
              {user ? (
                <>
                  <Link
                    to="/dashboard"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <LayoutDashboard size={15} /> Dashboard
                  </Link>
                  <Link
                    to="/dashboard/products"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Package size={15} /> My products
                  </Link>
                  <Link
                    to="/profile"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <UserIcon size={15} /> Profile
                  </Link>
                  <button
                    type="button"
                    className="nav-link flex items-center gap-2 py-2 text-left"
                    onClick={handleLogout}
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </>
              ) : (
                <Button asChild>
                  <Link to="/login">Login / Sign up</Link>
                </Button>
              )}
              <Button asChild>
                <Link to="/list" onClick={() => setMenuOpen(false)}>
                  Sell an item <ArrowRight size={15} />
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
