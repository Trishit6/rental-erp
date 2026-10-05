import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  useMarkAllNotificationsRead,
  useRecentNotifications,
  useSetNotificationRead,
  useDismissNotification,
  useUnreadCount,
} from "../query";
import { badgeLabel, bellLabel } from "./schema";
import { NotificationRow, NotificationRowSkeleton } from "./NotificationRow";

/**
 * The header's notification bell and its dropdown.
 *
 * ## This replaces an inline implementation, and moves the query with it
 *
 * The header previously owned a `useQuery` against `/notifications` and rendered its
 * own ten-row panel. That is the shape that produces the bugs this feature exists to
 * fix: the panel and the badge were reading the *same* list response, so the badge was
 * capped at whatever was in the first fifty rows and read `0` for anyone whose unread
 * notifications had scrolled past the window. Here the badge reads
 * `/notifications/unread-count` — a real `COUNT` over the whole table — while the
 * dropdown reads its own small page.
 *
 * ## Why it is a hand-rolled panel and not the shared `DropdownMenu`
 *
 * `DropdownMenu` is Radix, and Radix menus are built for *commands* (menu items, links
 * to settings): they manage focus as a single roving item and close on any activation.
 * A notification feed is a list of rows each with its own two controls and its own
 * navigation target, which is a popover, not a menu. Radix has `Popover` for exactly
 * this and it is not installed; the panel below implements the same three behaviours
 * that matter — closes on outside click, closes on `Escape`, returns focus to the
 * trigger — in about twenty lines, and uses the project's existing
 * `raised-surface`/`--layer-panel` styling rather than a second look.
 */
export function NotificationBell({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const { data: unread } = useUnreadCount(enabled);
  const count = typeof unread === "number" ? unread : 0;

  // Outside click and `Escape`, with focus returned to the trigger in both cases so a
  // keyboard user is not dropped back at the top of the document.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      {/* A native `<button>` rather than the shared `Button`, for one reason: this one
          needs a ref. `Button` spreads its props onto a plain element and does not
          forward one, and this trigger has to be focusable programmatically so
          `Escape` can return focus to it. The classes are the same
          `soft-button`/`size-10` treatment `Button variant="secondary" size="icon"`
          renders, so it is visually identical to the theme and cart controls beside
          it. */}
      <button
        ref={triggerRef}
        type="button"
        className="soft-button relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        aria-label={bellLabel(count)}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={!enabled}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <Bell size={18} />
        {count > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white"
            aria-hidden
          >
            {badgeLabel(count)}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            // `--layer-panel` rather than a literal z-index: this must clear the header
            // (30) and the floating controls (40) without a magic number that
            // will be wrong the moment either of those changes.
            // `min(22rem, 100vw - 2rem)` rather than a flat `w-[22rem]`: the panel is
            // right-anchored, so on a 360px handset a 22rem box sat flush against the
            // screen edge and broke the page gutter, and below 352px it overflowed and
            // clipped its own left column. The 1rem margin matches `page-wrap`.
            className="raised-surface absolute right-0 top-12 z-[var(--layer-panel)] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl"
          >
            <NotificationDropdown
              onClose={() => setOpen(false)}
              onNavigate={(to) => {
                setOpen(false);
                void navigate({ to });
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The panel's contents.
 *
 * Split out so the fetch only happens while the panel is open, and so the header's
 * `AnimatePresence` can animate a stable child.
 */
function NotificationDropdown({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (to: string) => void;
}) {
  const { data, isLoading, isError } = useRecentNotifications(true, 8);
  const setRead = useSetNotificationRead();
  const dismiss = useDismissNotification();
  const markAll = useMarkAllNotificationsRead();

  const items = data?.items ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <span className="text-sm font-extrabold">Notifications</span>
        <div className="flex items-center gap-1">
          {unreadTotal(data?.totalUnread) > 0 && (
            <button
              type="button"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/10 disabled:opacity-50"
            >
              <CheckCheck size={13} aria-hidden />
              Mark all read
            </button>
          )}
          <Link
            to="/notifications"
            onClick={onClose}
            aria-label="Notification settings"
            title="Notification settings"
            className="soft-button flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:text-primary"
          >
            <Settings2 size={14} aria-hidden />
          </Link>
        </div>
      </div>

      {isLoading ? (
        <ul className="py-1">
          {Array.from({ length: 4 }, (_, index) => (
            <NotificationRowSkeleton key={index} compact />
          ))}
        </ul>
      ) : isError ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          Couldn&apos;t load your notifications.
        </p>
      ) : items.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          No notifications yet.
        </p>
      ) : (
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              compact
              isPending={
                (setRead.isPending && setRead.variables?.id === item.id) ||
                (dismiss.isPending && dismiss.variables?.id === item.id)
              }
              onOpen={(target) => {
                if (!target.isRead) setRead.mutate({ id: target.id, read: true, wasRead: false });
                if (target.link) onNavigate(target.link);
              }}
              onToggleRead={(target) =>
                setRead.mutate({ id: target.id, read: !target.isRead, wasRead: target.isRead })
              }
              onDismiss={(target) => dismiss.mutate({ id: target.id, wasRead: target.isRead })}
            />
          ))}
        </ul>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="border-t border-border/60 px-2 py-1.5">
          <Link
            to="/notifications"
            onClick={onClose}
            className={cn(
              "block rounded-xl px-3 py-2 text-center text-xs font-bold text-primary",
              "transition hover:bg-primary/10",
            )}
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

/** The panel's unread total, defensively read: `undefined` while loading is not `NaN`. */
function unreadTotal(value: number | undefined): number {
  return typeof value === "number" ? value : 0;
}