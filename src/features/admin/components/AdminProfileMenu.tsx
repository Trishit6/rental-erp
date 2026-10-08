import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, IdCard, LogOut, Settings } from "lucide-react";
import { Avatar } from "@/components/shared/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogoutMutation } from "@/features/auth/query";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * The admin topbar's identity menu.
 *
 * ## Same identity system as the rest of the app
 *
 * This is the user's own account menu in an admin skin — the profile, settings and
 * logout all go through the app's existing flows. There is deliberately no second
 * admin identity: an administrator is an ordinary account whose role is checked
 * server-side, so signing out here revokes the same session the storefront would.
 *
 * "View Store" is the one item that belongs to the *workspace* rather than the
 * account: it walks the administrator out of the control surface and back to the
 * marketplace they administer.
 */
export function AdminProfileMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const logoutMutation = useLogoutMutation();

  // Mirrors the storefront header's logout: the server revokes the session before the
  // response is back, so `onSettled` clears the client side either way and the
  // navigation must not wait on a response that may never arrive.
  async function handleLogout() {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // Navigation below is unconditional — see the comment in `useLogoutMutation`.
    }
    void navigate({ to: "/" });
  }

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="soft-button flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Admin account menu"
        >
          <Avatar name={user.name} url={user.avatarUrl} className="size-8 text-sm" />
          <span className="hidden max-w-24 truncate text-sm font-bold xl:block">
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
        <DropdownMenuItem onSelect={() => void navigate({ to: "/profile" })}>
          <IdCard size={15} aria-hidden />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/admin/settings" })}>
          <Settings size={15} aria-hidden />
          Admin Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/" })}>
          <ExternalLink size={15} aria-hidden />
          View Store
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleLogout()}>
          <LogOut size={15} aria-hidden />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}