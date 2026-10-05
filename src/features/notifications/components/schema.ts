import { z } from "zod";
import {
  EMAIL_CAPABLE_CATEGORIES,
  type NotificationCategory,
  type NotificationFilters,
  type NotificationIconKey,
  type NotificationItem,
  type PreferenceKey,
} from "../types";

/**
 * The notifications feature's client-side vocabulary: the option lists, the URL
 * parsing and the pure label/format helpers the components share.
 *
 * ## Why nothing here is imported from `server/`
 *
 * `server/lib/notification-events.ts` is the authority on types, categories and
 * destinations, and the *server* resolves the label, the category and the icon onto
 * every row it returns — so the browser never needs to look one up. What is left for
 * the client is presentation: how a category is labelled on a chip, which icons exist
 * in `lucide-react`, and how a timestamp reads.
 *
 * Importing the server module from `src/` would also pull it into the Vite bundle and
 * into the jsdom test run, where it has no business being. So the small amount of
 * vocabulary the UI genuinely needs is declared here, and `tests/notification-events.test.ts`
 * asserts the two agree.
 */

/* -------------------------------- categories -------------------------------- */

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  ORDERS: "Orders & purchases",
  RENTALS: "Rentals",
  PAYMENTS: "Payments & refunds",
  SELLER: "Seller activity",
  WISHLIST: "Wishlist",
  ADMIN: "Admin queue",
};

/**
 * One sentence per category, for the preferences form.
 *
 * Every line describes what the app actually does, not a general promise about
 * marketing mail. A user deciding whether to turn something off is making that
 * decision on the strength of this text, so a vague line makes the toggle a guess.
 */
export const CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  ORDERS: "Order confirmations, dispatch updates and cancellations.",
  RENTALS: "Bookings, start dates, return reminders and overdue notices.",
  PAYMENTS: "Receipts, failed payments, refunds and refunds being processed.",
  SELLER: "New orders, rental bookings, reviews and messages about your listings.",
  WISHLIST: "Price changes and items you saved coming back in stock.",
  ADMIN: "Listings awaiting review, new seller sign-ups and refund requests.",
};

/** All six, in the order the settings form shows them. */
export const CATEGORY_ORDER: readonly NotificationCategory[] = [
  "ORDERS",
  "RENTALS",
  "PAYMENTS",
  "SELLER",
  "WISHLIST",
  "ADMIN",
];

/** Whether a category offers an email switch — the same answer as the server's. */
export function categoryHasEmail(category: NotificationCategory): boolean {
  return (EMAIL_CAPABLE_CATEGORIES as readonly NotificationCategory[]).includes(category);
}

/**
 * The key a category occupies in the preferences payload.
 *
 * The server's `NotificationPreferencesPayload` uses camelCase field names (`orders`,
 * `seller`) while the filter vocabulary uses uppercase tokens (`ORDERS`, `SELLER`) —
 * because the former is JSON a settings form round-trips and the latter is what a
 * notification's `category` column carries. They are two vocabularies, so the join
 * between them lives here, once, rather than as an ad-hoc `.toLowerCase()` at each use.
 */
export const PREFERENCE_KEYS: Record<NotificationCategory, PreferenceKey> = {
  ORDERS: "orders",
  RENTALS: "rentals",
  PAYMENTS: "payments",
  SELLER: "seller",
  WISHLIST: "wishlist",
  ADMIN: "admin",
};

/** One row of the settings form, in render order. */
export const PREFERENCE_GROUPS: {
  category: NotificationCategory;
  key: PreferenceKey;
  label: string;
  description: string;
  hasEmail: boolean;
}[] = [
  {
    category: "ORDERS",
    key: "orders",
    label: CATEGORY_LABELS.ORDERS,
    description: CATEGORY_DESCRIPTIONS.ORDERS,
    hasEmail: true,
  },
  {
    category: "RENTALS",
    key: "rentals",
    label: CATEGORY_LABELS.RENTALS,
    description: CATEGORY_DESCRIPTIONS.RENTALS,
    hasEmail: true,
  },
  {
    category: "PAYMENTS",
    key: "payments",
    label: CATEGORY_LABELS.PAYMENTS,
    description: CATEGORY_DESCRIPTIONS.PAYMENTS,
    hasEmail: true,
  },
  {
    category: "SELLER",
    key: "seller",
    label: CATEGORY_LABELS.SELLER,
    description: CATEGORY_DESCRIPTIONS.SELLER,
    hasEmail: true,
  },
  {
    category: "WISHLIST",
    key: "wishlist",
    label: CATEGORY_LABELS.WISHLIST,
    description: CATEGORY_DESCRIPTIONS.WISHLIST,
    // No email switch is rendered at all — see `CATEGORY_EMAIL_CAPABLE`.
    hasEmail: false,
  },
  {
    category: "ADMIN",
    key: "admin",
    label: CATEGORY_LABELS.ADMIN,
    description: CATEGORY_DESCRIPTIONS.ADMIN,
    hasEmail: false,
  },
];

/* ---------------------------------- filters --------------------------------- */

export const CATEGORY_VALUES = [
  "ORDERS",
  "RENTALS",
  "PAYMENTS",
  "SELLER",
  "WISHLIST",
  "ADMIN",
] as const;

/** Page size for the feed. The server allows 10/20/50; 20 matches its default. */
export const NOTIFICATION_PAGE_SIZE = 20;

const feedSearchSchema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  category: z.enum(CATEGORY_VALUES).optional(),
  unread: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

/**
 * Parse untrusted URL search params into a canonical filter object.
 *
 * `z.coerce` plus `.catch` throughout, matching `lib/product-search/schema`: these
 * arrive as query strings, and a hand-edited `?page=abc` must degrade to page 1
 * rather than throw a `VALIDATION_ERROR` and replace the page with an error screen.
 *
 * The category is validated against the *declared* union rather than cast, so a
 * bookmarked `?category=<script>` falls back to "no filter" instead of sending a value
 * the server would ignore anyway.
 */
export function parseNotificationFilters(input: Record<string, unknown>): NotificationFilters {
  const parsed = feedSearchSchema.safeParse(input);
  if (!parsed.success) return { page: 1, pageSize: NOTIFICATION_PAGE_SIZE };

  return {
    page: parsed.data.page,
    pageSize: NOTIFICATION_PAGE_SIZE,
    category: parsed.data.category ?? null,
    unreadOnly: parsed.data.unread,
  };
}

/** The filter object as clean URL params — empty values are dropped. */
export function toNotificationUrlSearch(filters: NotificationFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (filters.category) out.category = filters.category;
  if (filters.unreadOnly) out.unread = "true";
  if (filters.page && filters.page > 1) out.page = String(filters.page);
  return out;
}

/* --------------------------------- display ---------------------------------- */

/**
 * A one-line relative time.
 *
 * Deliberately not a date for anything recent: "2 minutes ago" is what makes a feed
 * feel live, and a notification list full of timestamps is a list nobody reads. Falls
 * back to a real date past a week, because "47 days ago" is less useful than the date
 * and roughly as short.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The date heading a day's worth of notifications sit under.
 *
 * `Today` / `Yesterday` / a formatted date, which is what makes a long feed skimmable.
 * Compared against local midnight rather than a fixed 24-hour window so "Yesterday"
 * means the calendar day before, which is what a reader means by it.
 */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const dayDelta = Math.round((startOfToday - thenDay) / 86_400_000);

  if (dayDelta <= 0) return "Today";
  if (dayDelta === 1) return "Yesterday";
  if (dayDelta < 7) return then.toLocaleDateString("en-IN", { weekday: "long" });
  return then.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** Two true when both timestamps fall on the same local calendar day. */
export function sameDay(a: string, b: string): boolean {
  const first = new Date(a);
  const second = new Date(b);
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return true;
  return first.toDateString() === second.toDateString();
}

/**
 * The badge's number, capped at what a 4-wide pill can show.
 *
 * `99+` rather than a four-digit number that would overflow the pill and push the bell
 * sideways in the header — the exact number is one click away on the feed page.
 */
export function badgeLabel(unread: number): string {
  return unread > 99 ? "99+" : String(unread);
}

/** Accessible name for the bell, so a screen reader reads the count, not "button". */
export function bellLabel(unread: number): string {
  if (unread <= 0) return "Notifications, none unread";
  return `Notifications, ${unread} unread`;
}

/** Accessible name for one row's read/unread control. */
export function readToggleLabel(item: NotificationItem): string {
  return item.isRead
    ? `Mark “${item.title}” as unread`
    : `Mark “${item.title}” as read`;
}

/** Accessible name for one row's dismiss control. */
export function dismissLabel(item: NotificationItem): string {
  return `Dismiss “${item.title}”`;
}

/**
 * Group a page of notifications under day headings.
 *
 * Done on the rows already fetched rather than by refetching per day: the feed is
 * paginated newest-first, so consecutive rows are almost always contiguous, and this
 * way the headings always agree with the page the user is actually looking at.
 */
export function groupByDay(items: NotificationItem[]): { day: string; items: NotificationItem[] }[] {
  const groups: { day: string; items: NotificationItem[] }[] = [];
  let currentDay: string | null = null;

  for (const item of items) {
    const day = dayHeading(item.createdAt);
    if (day !== currentDay) {
      groups.push({ day, items: [item] });
      currentDay = day;
    } else {
      groups[groups.length - 1].items.push(item);
    }
  }
  return groups;
}

/** The feed page's supporting line, which distinguishes "loading" from "empty". */
export function notificationsSubtitle(
  total: number | undefined,
  unread: number | undefined,
  isLoading: boolean,
): string {
  if (isLoading) return "Loading your notifications…";
  if (!total) return "Nothing here yet — order something and this fills up.";
  const parts = [`${total} notification${total === 1 ? "" : "s"}`];
  if (unread && unread > 0) parts.push(`${unread} unread`);
  return parts.join(" · ");
}

/**
 * The empty state for a *filtered* view, which is a different situation from an empty
 * feed and needs different words: nothing is wrong, the filter just excludes
 * everything, and the action is to clear it.
 */
export function filteredEmptyTitle(category: NotificationCategory | null, unreadOnly: boolean): string {
  if (unreadOnly) return "Nothing unread";
  if (category) return `No ${CATEGORY_LABELS[category].toLowerCase()} notifications`;
  return "No notifications match";
}

/** Icon keys this build knows how to draw; anything else falls back to `DEFAULT`. */
export const KNOWN_ICON_KEYS: readonly NotificationIconKey[] = [
  "ACCOUNT",
  "ORDER",
  "RENTAL",
  "PAYMENT",
  "LISTING",
  "MESSAGE",
  "WISHLIST",
  "ADMIN",
  "DEFAULT",
];