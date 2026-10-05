import { Link } from "@tanstack/react-router";
import { Check, Mail, MailOpen, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { NotificationItem } from "../types";
import {
  dismissLabel,
  readToggleLabel,
  relativeTime,
} from "./schema";
import { DEFAULT_NOTIFICATION_ICON, NOTIFICATION_ICONS } from "./NotificationIcon";

/**
 * One notification, as a row.
 *
 * ## A link when there is one, and not a fake link when there is not
 *
 * `link` is `null` for a type with no destination (`PAYMENT_FAILED` before checkout
 * existed) and for a notification whose entity has since been deleted. Rather than
 * rendering a disabled-looking button that does nothing, those rows render as plain
 * content — the notification is still worth reading, it just has nowhere to send you.
 * That distinction is why `isRead` is on the row itself and not only on a clickable
 * surface: an unread row with no destination still needs to *look* unread.
 *
 * ## The whole row is the link, and the controls are not
 *
 * Clicking a notification means "show me the thing". So the title is the link and the
 * row's hover treatment is the affordance — a click target that is the full row would
 * swallow clicks meant for the read and dismiss controls sitting on top of it. The two
 * controls are `<button>`s nested *outside* the `<Link>`'s content, so they are always
 * reachable and never trigger navigation.
 */
export function NotificationRow({
  item,
  onOpen,
  onToggleRead,
  onDismiss,
  isPending = false,
  compact = false,
}: {
  item: NotificationItem;
  /** Called instead of navigating, when the row has a destination. */
  onOpen?: (item: NotificationItem) => void;
  onToggleRead: (item: NotificationItem) => void;
  onDismiss: (item: NotificationItem) => void;
  /** True while this row's own write is in flight. */
  isPending?: boolean;
  /** The dropdown's tighter variant — no body text, one line of title. */
  compact?: boolean;
}) {
  const Icon = NOTIFICATION_ICONS[item.icon] ?? DEFAULT_NOTIFICATION_ICON;
  const read = item.isRead;

  // The title is the link. Wrapping the *text* rather than the whole row keeps the
  // read and dismiss controls clickable, and keeps the anchor honest — it is a real
  // `<a>`, so middle-click, open-in-new-tab and the status-bar preview all work, none of
  // which survive being replaced with a div and an onClick.
  const title = (
    <p className={cn("truncate text-sm", read ? "font-semibold" : "font-extrabold")}>
      {item.link ? (
        <Link
          to={item.link}
          onClick={(event) => {
            // Marking read and dismissing are fire-and-forget here: the user is
            // navigating away, so neither failure should block the navigation, and
            // both reconcile themselves against the server afterwards.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            if (!read) onToggleRead(item);
            onOpen?.(item);
          }}
          className="rounded outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {item.title}
        </Link>
      ) : (
        item.title
      )}
    </p>
  );

  const body = (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-1",
        // Unread rows are marked by weight and a tint rather than by a dot that
        // disappears at text sizes users actually browse at.
        read ? "opacity-70" : "",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "soft-button mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
            read ? "text-muted-foreground" : "text-primary",
          )}
          aria-hidden
        >
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          {title}
          {!compact && item.body && (
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          )}
        </div>
      </div>
      <p className="flex items-center gap-2 pl-12 text-[11px] font-semibold text-muted-foreground">
        <span>{item.label}</span>
        <span aria-hidden>·</span>
        <time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
        {!read && (
          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
            New
          </span>
        )}
      </p>
    </div>
  );

  const controls = (
    <div className="flex shrink-0 items-center gap-0.5 self-start">
      <button
        type="button"
        aria-label={readToggleLabel(item)}
        title={readToggleLabel(item)}
        disabled={isPending}
        onClick={() => onToggleRead(item)}
        className="soft-button flex size-8 items-center justify-center rounded-xl text-muted-foreground transition hover:text-primary disabled:opacity-50"
      >
        {read ? <Mail size={15} /> : <MailOpen size={15} />}
      </button>
      <button
        type="button"
        aria-label={dismissLabel(item)}
        title={dismissLabel(item)}
        disabled={isPending}
        onClick={() => onDismiss(item)}
        className="soft-button flex size-8 items-center justify-center rounded-xl text-muted-foreground transition hover:text-destructive disabled:opacity-50"
      >
        <X size={15} />
      </button>
    </div>
  );

  // One `<li>` shape for both cases, because `link` is handled inside `title` — a row
  // with no destination simply renders a title that is not a link, and stays
  // clickable where it can be (the read and dismiss controls). Splitting this into two
  // branches would duplicate the layout for a difference that is one ternary wide.
  return (
    <li
      className={cn(
        "flex items-start gap-1 rounded-2xl transition hover:bg-primary/5 focus-within:bg-primary/5",
        read ? "" : "bg-primary/5",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3">{body}</div>
      {controls}
    </li>
  );
}

/** A row rendered while the feed is loading — same shape, no content. */
export function NotificationRowSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <span className="soft-button size-9 shrink-0 animate-pulse rounded-xl" aria-hidden />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-muted" aria-hidden />
        {!compact && <div className="h-2.5 w-full animate-pulse rounded-full bg-muted" aria-hidden />}
        <div className="h-2 w-24 animate-pulse rounded-full bg-muted" aria-hidden />
      </div>
    </li>
  );
}

/** The "everything is read" mark shown at the top of a fully-caught-up feed. */
export function CaughtUpMark() {
  return (
    <div className="flex items-center justify-center gap-2 py-3 text-xs font-semibold text-muted-foreground">
      <Check size={14} aria-hidden />
      You&apos;re all caught up
    </div>
  );
}