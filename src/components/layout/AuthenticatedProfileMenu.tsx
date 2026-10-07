import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  Heart,
  LogOut,
  MessageCircle,
  Repeat2,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/auth-context";
import { useLogoutMutation } from "@/features/auth/query";
import { isSellerRole } from "@/features/auth/types";
import { Avatar } from "@/components/shared/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The topbar's identity control: avatar, first name and role, opening a menu of
 * the account's destinations plus the role-appropriate workspace, and logout.
 *
 * Built on the shared Radix dropdown, so focus, Escape and outside-click
 * behaviour come free. The logout path is the same one the storefront header
 * uses: the server clears the cookies and the client wipes the private caches,
 * then the visitor is taken to the public home.
 */
export function AuthenticatedProfileMenu() {
  const { user } = useAuth();
  const logoutMutation = useLogoutMutation();
  const navigate = useNavigate();

  if (!user) return null;

  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync();
      toast("Signed out. See you soon!");
    } catch {
      // `useLogoutMutation` clears the client session either way — the server has
      // already revoked the session before answering — so leaving is correct on
      // both paths.
      toast("Signed out on this device. We couldn't reach the server to confirm.");
    }
    void navigate({ to: "/" });
  }

  const roleLabel = user.role === "ADMIN" ? "Admin" : user.role === "SELLER" ? "Seller" : "Customer";

  const items: { to: string; label: string; icon: typeof UserIcon }[] = [
    { to: "/profile", label: "Profile", icon: UserIcon },
    { to: "/orders", label: "Orders", icon: ShoppingBag },
    { to: "/rentals", label: "Rentals", icon: Repeat2 },
    { to: "/favorites", label: "Favorites", icon: Heart },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="soft-button flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-2.5 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Account menu"
        >
          <Avatar name={user.name} url={user.avatarUrl} className="size-8 text-sm" />
          <span className="hidden max-w-28 truncate text-sm font-bold md:block">
            {user.name.split(" ")[0]}
          </span>
          <ChevronDown size={14} aria-hidden className="hidden text-muted-foreground md:block" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <p className="truncate text-sm font-extrabold">{user.name}</p>
          <p className="truncate text-xs font-medium text-muted-foreground">
            {roleLabel} · {user.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuItem key={item.to} onSelect={() => void navigate({ to: item.to })}>
            <item.icon size={15} aria-hidden />
            {item.label}
          </DropdownMenuItem>
        ))}
        {isSellerRole(user.role) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void navigate({ to: "/seller" })}>
              <Store size={15} aria-hidden />
              Seller Workspace
            </DropdownMenuItem>
          </>
        )}
        {user.role === "ADMIN" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void navigate({ to: "/admin" })}>
              <ShieldCheck size={15} aria-hidden />
              Admin Workspace
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