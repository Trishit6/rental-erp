import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Heart,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Repeat2,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../lib/auth/auth-context";
import { useLogoutMutation } from "@/features/auth/query";
import { isSellerRole } from "@/features/auth/types";
import { CartDrawerTrigger } from "@/features/cart/components/CartDrawerTrigger";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { useUnreadCount } from "@/features/notifications/query";
import { badgeLabel } from "@/features/notifications/components/schema";
import { ThemeToggle } from "@/lib/theme";
import { Avatar } from "../shared/avatar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function SiteHeader() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Navbar elevation on scroll: more opaque, stronger shadow.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    } catch {
      // `useLogoutMutation` clears the client session either way — see its comment — so
      // staying on a protected page here would drop the user onto a route that is now
      // guarded, and bounce them to the login screen with an *expiry* message for a logout
      // they just performed themselves. Leaving is what they asked for, so leave.
      toast("Signed out on this device. We couldn't reach the server to confirm.");
    }
    void navigate({ to: "/" });
  }

  return (
    <header
      className={`sticky top-0 z-[var(--layer-header)] border-b border-white/70 bg-background/90 backdrop-blur-xl transition-all duration-300 dark:border-white/5 ${
        scrolled ? "scrolled-header" : ""
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
              {/* The bell and its panel are the notifications feature's, not the
                  header's. It used to be an inline `useQuery` + hand-rolled list here,
                  which meant the badge was `unread` off the same fifty-row page the
                  panel drew — so anyone with more unread than fit in the window was
                  permanently told `0`. `NotificationBell` reads a real COUNT for the
                  badge and a separate small page for the panel. */}
              <NotificationBell enabled={!!user} />
              <ProfileMenu />
            </>
          ) : (
            /*
             * Two distinct destinations, not one combined control. They answer different
             * questions and they lead to different forms, so collapsing them into
             * "Login / Sign up" made a first-time visitor guess which one they wanted.
             *
             * These and the account control below are mutually exclusive by construction —
             * both branches read the same `user` from one query, so there is no state in
             * which a header shows "Login" next to "My Profile".
             */
            <>
              <Button asChild variant="ghost">
                <Link to="/login">Login</Link>
              </Button>
              <Button asChild>
                <Link to="/register">Register</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/list">
                  <span>Sell an item</span>
                  <ArrowRight size={15} aria-hidden />
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
                    to="/profile"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <UserIcon size={15} /> Profile
                  </Link>
                  <Link
                    to="/profile/orders"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <ShoppingBag size={15} /> My orders
                  </Link>
                  <Link
                    to="/profile/rentals"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Repeat2 size={15} /> My rentals
                  </Link>
                  <Link
                    to="/favorites"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Heart size={15} /> Wishlist
                  </Link>
                  {/* The count here is the same shared query the bell reads, so the two
                      cannot disagree, and it costs nothing extra to render. */}
                  <Link
                    to="/notifications"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Bell size={15} />
                    Notifications
                    <MobileNotificationCount />
                  </Link>
                  <Link
                    to="/messages"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <MessageCircle size={15} /> Messages
                  </Link>
                  <Link
                    to="/profile/activity"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <History size={15} /> Activity
                  </Link>
                  <Link
                    to="/settings"
                    className="nav-link flex items-center gap-2 py-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Settings size={15} /> Settings
                  </Link>
                  {/*
                   * Seller-only. `/seller` is the seller workspace and its pages read
                   * `/api/seller/*`, so offering it to a customer meant every tap either
                   * redirected to onboarding or rendered a page whose requests all 403.
                   * The role shown here is the server's, from the session query — the same
                   * value `requireSeller` guards on.
                   */}
                  {isSellerRole(user.role) && (
                    <Link
                      to="/seller"
                      className="nav-link flex items-center gap-2 py-2"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Store size={15} aria-hidden /> Seller Dashboard
                    </Link>
                  )}
                  {user.role === "ADMIN" && (
                    <Link
                      to="/admin"
                      className="nav-link flex items-center gap-2 py-2"
                      onClick={() => setMenuOpen(false)}
                    >
                      <ShieldCheck size={15} /> Admin workspace
                    </Link>
                  )}
                  <button
                    type="button"
                    className="nav-link flex items-center gap-2 py-2 text-left"
                    onClick={handleLogout}
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </>
              ) : (
                /* Same two destinations as the desktop cluster, as two controls rather than
                   one "Login / Sign up" link — see the note in the header bar above. */
                <div className="flex flex-col gap-2">
                  <Button asChild variant="secondary">
                    <Link to="/login" onClick={() => setMenuOpen(false)}>
                      Login
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link to="/register" onClick={() => setMenuOpen(false)}>
                      Register
                    </Link>
                  </Button>
                </div>
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

/**
 * The signed-in identity control.
 *
 * ## Why a dropdown and not a second Dashboard button
 *
 * The header's signed-in cluster previously ended in one "Dashboard" button, and
 * every account destination (profile, orders, rentals, wishlist, selling, admin)
 * was reachable only from the mobile sheet or by typing the URL. The spec (§8) wants
 * the Login action to become a Profile control after sign-in; this is that control.
 *
 * It is rendered in the same slot, so the header layout keeps its shape, and the
 * mobile sheet keeps its own flat list — a Radix dropdown is the wrong control at
 * that size.
 */
function ProfileMenu() {
  const { user } = useAuth();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync();
      toast("Signed out. See you soon!");
    } catch {
      // Same reasoning as the header bar's copy of this handler: the client session is gone
      // regardless, so the navigation happens on both paths.
      toast("Signed out on this device. We couldn't reach the server to confirm.");
    }
    void navigate({ to: "/" });
  }

  // One flat list of destinations, in the order a user thinks about them: what I am,
  // what I have, what I am waiting on, then the actions. Messages and Notifications
  // sit with the "waiting on me" items rather than at the end, because for a seller
  // both are where the day starts.
  const items: { to: string; label: string; icon: typeof UserIcon }[] = [
    { to: "/profile", label: "My Profile", icon: UserIcon },
    { to: "/profile/orders", label: "My Orders", icon: ShoppingBag },
    { to: "/profile/rentals", label: "My Rentals", icon: Repeat2 },
    { to: "/favorites", label: "Wishlist", icon: Heart },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/profile/activity", label: "My Activity", icon: History },
    { to: "/cart", label: "Cart", icon: Package },
    { to: "/list", label: "Sell your product", icon: Plus },
    // `Settings` is the authenticated workspace's preference page (`/settings`);
    // sellers additionally get their shopfront form, which lives in the seller
    // workspace and is `requireSeller`-guarded.
    { to: "/settings", label: "Settings", icon: Settings },
    ...(isSellerRole(user.role)
      ? [{ to: "/seller/settings", label: "Shopfront settings", icon: Settings }]
      : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="soft-button flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Account menu"
        >
          {/*
            The shared `Avatar`, rather than the `user.avatar ? … : initial` ternary that
            was here. Two reasons, and both were real bugs:

              - It read `user.avatar`, a field that has never existed on the wire — the
                server sends `avatarUrl`. TypeScript believed it because the type said
                `avatar: string | null`, so the expression was always `undefined` and
                *every* signed-in user got a fallback initial, photo or not. Silently, with
                no error anywhere.
              - The hand-rolled version had no `onError` fallback, so an `avatar_url`
                pointing at a deleted upload rendered the browser's broken-image icon
                inside the circle. `Avatar` handles that, and keeps the four other places in
                the app that draw a person consistent with this one.
          */}
          <Avatar name={user.name} url={user.avatarUrl} className="size-8 text-sm" />
          <span className="hidden max-w-28 truncate text-sm font-bold lg:block">
            {user.name.split(" ")[0]}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <p className="truncate text-sm font-extrabold">{user.name}</p>
          <p className="truncate text-xs font-medium text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuItem key={item.to} onSelect={() => navigate({ to: item.to })}>
            <item.icon size={15} aria-hidden />
            {item.label}
          </DropdownMenuItem>
        ))}
        {user.role === "ADMIN" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate({ to: "/admin" })}>
              <ShieldCheck size={15} aria-hidden />
              Admin workspace
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleLogout()}>
          <LogOut size={15} aria-hidden />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The unread count beside "Notifications" in the mobile sheet.
 *
 * Reads the same `useUnreadCount` entry the bell does, so the sheet and the badge are
 * literally one query — they cannot drift, and the sheet costs no extra request. It
 * renders nothing at all when the count is zero rather than a `0`, because a `0` next to
 * a label reads as "this is broken and empty" where the absence of a pill reads as
 * "nothing to see here".
 */
function MobileNotificationCount() {
  const { data: unread } = useUnreadCount(true);
  if (!unread || unread <= 0) return null;
  return (
    <span
      className="ml-auto rounded-full bg-destructive/12 px-2 py-0.5 text-[11px] font-bold text-destructive"
      aria-label={`${unread} unread`}
    >
      {badgeLabel(unread)}
    </span>
  );
}
