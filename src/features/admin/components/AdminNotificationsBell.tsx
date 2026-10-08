import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/features/notifications/query";
import { useAuth } from "@/lib/auth/auth-context";

/**
 * The admin topbar's notifications entry.
 *
 * ## Why it is a link, not a dropdown
 *
 * The storefront header's bell has a dropdown because the storefront has no
 * notifications page of its own in reach of the click without leaving the page. The
 * admin workspace *does* own one — `/admin/notifications` is a module in this
 * workspace — so the honest affordance here is "see what's new" straight onto that
 * page, one click, no nested panel.
 *
 * The badge is the same real `COUNT` (`/api/notifications/unread-count`) the
 * storefront bell reads, and it renders nothing at zero rather than a misleading
 * "0" pill. An administrator's own notifications are their private user data — an
 * admin queue email arrives here like any other account's would.
 */
export function AdminNotificationsBell() {
  const { user } = useAuth();
  const { data: unread } = useUnreadCount(Boolean(user));
  const count = typeof unread === "number" ? unread : 0;

  return (
    <Link
      to="/admin/notifications"
      className="soft-button relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-all duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
    >
      <Bell size={18} aria-hidden />
      {count > 0 ? (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white"
          aria-hidden
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}