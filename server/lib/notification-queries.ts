import { and, count, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { db } from "../db";
import { notificationPreferences, notifications } from "../schema";
import {
  isInternalRoute,
  notificationCategoryFor,
  notificationIconFor,
  notificationTypeDefinition,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_ENTITY_TYPES,
  NOTIFICATION_TYPES,
  type NotificationCategory,
  type NotificationEntityType,
  type NotificationIconKey,
} from "./notification-events";

/**
 * Reading notifications and preferences.
 *
 * Split from `notifications.ts` because the two halves fail in opposite directions:
 * writing is best-effort and must never break a request, while reading is
 * authoritative and *is* the page. A helper here that swallowed an error would turn
 * a database problem into a permanently empty bell that the user cannot tell from
 * "nothing has happened", so nothing here catches anything.
 */

/* ---------------------------------- listing --------------------------------- */

export const NOTIFICATION_PAGE_SIZES = [10, 20, 50] as const;

/**
 * List query.
 *
 * `.catch()`-guarded throughout, matching `ordersListQuerySchema`: these arrive as
 * query strings, and an unknown page or a nonsense size must degrade to a usable
 * list rather than throw a 400 and leave the user on an error page for a mistyped
 * URL. The one thing that is *not* lenient is the filter itself — an unknown
 * category is dropped rather than silently matching nothing.
 */
export type NotificationListQuery = {
  page: number;
  pageSize: number;
  /** `"true"` to show only unread. */
  unreadOnly: boolean;
  category: NotificationCategory | null;
};

export const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;

export function parseNotificationListQuery(
  raw: Record<string, string | undefined>,
): NotificationListQuery {
  const page = Number(raw.page);
  const pageSize = Number(raw.pageSize);
  const category = raw.category?.trim().toUpperCase();
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (NOTIFICATION_PAGE_SIZES as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_NOTIFICATION_PAGE_SIZE,
    unreadOnly: raw.unread === "true" || raw.unreadOnly === "true",
    category: (NOTIFICATION_CATEGORIES as readonly string[]).includes(category ?? "")
      ? (category as NotificationCategory)
      : null,
  };
}

/** One notification as the client receives it. */
export type NotificationPayload = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  /** Resolved internal route, or `null` when the type has no destination. */
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  relatedEntityType: NotificationEntityType | null;
  relatedEntityId: number | null;
  /** The category, for the feed's filter chips. */
  category: NotificationCategory;
  /** Display metadata, resolved server-side so the client holds no lookup table. */
  label: string;
  icon: NotificationIconKey;
};

/**
 * The entity type as the client receives it, or `null`.
 *
 * Coerced rather than cast because the column is a plain `varchar`: the declared
 * vocabulary is what the *writer* produces, but a row seeded before `notify()`
 * existed could hold anything, and the client types this field as the union. An
 * unrecognised value becomes `null` — the feed then renders the row as a generic
 * notification instead of mislabelling it.
 */
function toEntityType(value: string | null): NotificationEntityType | null {
  return NOTIFICATION_ENTITY_TYPES.includes(value as NotificationEntityType)
    ? (value as NotificationEntityType)
    : null;
}

/** A `Date` column as the ISO string the client's `Date` parsing expects. */
function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toPayload(row: typeof notifications.$inferSelect): NotificationPayload {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    // Re-validated on read: `link` is plain text that predates `notify()`'s
    // guarantee, and the client pushes it straight into `navigate({ to })`.
    link: isInternalRoute(row.link) ? row.link : null,
    isRead: row.readAt !== null,
    readAt: toIso(row.readAt),
    createdAt: row.createdAt.toISOString(),
    relatedEntityType: toEntityType(row.relatedEntityType),
    relatedEntityId: row.relatedEntityId,
    category: notificationCategoryFor(row.type),
    label: notificationTypeDefinition(row.type)?.label ?? "Notification",
    icon: notificationIconFor(row.type),
  };
}

/**
 * One user's notifications, newest first, plus the counts the UI needs.
 *
 * ## Why `unread` is a separate COUNT and not derived from the page
 *
 * The original implementation counted unread rows *among the 50 it had just
 * fetched*, which means the badge read `0` for a user with 60 unread notifications
 * once the feed had scrolled past them — and silently under-reported for anyone whose
 * unread rows were older than the window. The badge has to be the truth about the
 * whole table, so it is a `COUNT(*) WHERE read_at IS NULL` over the user's rows, and
 * the page is a different query entirely.
 *
 * The two run concurrently rather than sequentially: neither depends on the other,
 * and the feed's own total comes from the same aggregate the page arithmetic needs.
 */
export async function listNotifications(
  userId: number,
  query: NotificationListQuery,
): Promise<{
  items: NotificationPayload[];
  total: number;
  totalUnread: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const predicates: SQL[] = [eq(notifications.userId, userId)];
  if (query.unreadOnly) predicates.push(isNull(notifications.readAt));

  // A category filter is applied in SQL as a type IN (...) rather than in
  // JavaScript after the page is fetched: filtering 20 rows out of 20,000 to show
  // the 20 that match is the difference between a filter that works and one that
  // appears to work on a small account.
  if (query.category) {
    const types = categoryTypes(query.category);
    if (types.length === 0) {
      // A category with no types cannot match; an empty page beats a full one.
      return {
        items: [],
        total: 0,
        totalUnread: await countUnread(userId),
        page: query.page,
        pageSize: query.pageSize,
        totalPages: 1,
      };
    }
    predicates.push(inArray(notifications.type, types));
  }

  const where = and(...predicates);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      // `id` breaks the tie. `created_at` is a `timestamp` with second precision, so
      // two notifications written in the same second currently have no defined order
      // between them — which is exactly when a user is most likely to be reading the
      // feed, because they just triggered both.
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(notifications).where(where),
    db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);

  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map(toPayload),
    total,
    totalUnread: totals[1]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** The bell's number. One row count over the user's unread notifications. */
export async function countUnread(userId: number): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.total ?? 0;
}

/** The type tokens belonging to one category, for the SQL filter above. */
function categoryTypes(category: NotificationCategory): string[] {
  return (Object.keys(NOTIFICATION_TYPES) as (keyof typeof NOTIFICATION_TYPES)[]).filter(
    (type) => NOTIFICATION_TYPES[type].category === category,
  );
}

/* --------------------------------- mutation --------------------------------- */

/**
 * Mark one notification read or unread.
 *
 * Scoped by `userId` in the `WHERE`, which is the whole authorization story: there is
 * no id that can address someone else's notification, because the update simply will
 * not match. Returns whether a row was affected, so the client can treat a
 * no-op as a no-op rather than as success.
 *
 * Re-opening a notification is supported (`read: false`) for the same reason
 * "mark unread" exists everywhere else: a user who reads a message by accident
 * needs a way back.
 */
export async function setNotificationRead(
  userId: number,
  notificationId: number,
  read: boolean,
): Promise<{ updated: boolean }> {
  const result = await db
    .update(notifications)
    .set({ readAt: read ? new Date() : null })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  return { updated: result[0].affectedRows > 0 };
}

/**
 * Mark every unread notification read.
 *
 * Scoped the same way. The `readAt IS NULL` guard means repeated calls are
 * idempotent and, more importantly, that an already-read notification's original
 * `read_at` is never overwritten with "now" — a feed that shows "read 3 days ago"
 * should not start claiming it was read a second ago.
 */
export async function markAllNotificationsRead(userId: number): Promise<{ updated: number }> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { updated: result[0].affectedRows };
}

/**
 * Dismiss one notification.
 *
 * A hard delete, not a hide: the bell's unread set is derived from `read_at`, so
 * there is no separate "dismissed" column and adding one would mean every read
 * having to exclude both. The user has asked for it not to exist.
 */
export async function deleteNotification(
  userId: number,
  notificationId: number,
): Promise<{ deleted: boolean }> {
  const result = await db
    .delete(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  return { deleted: result[0].affectedRows > 0 };
}

/* -------------------------------- preferences ------------------------------- */

/** The preference row as the client sees it, with defaults filled in. */
export type NotificationPreferencesPayload = {
  orders: { inApp: boolean; email: boolean };
  rentals: { inApp: boolean; email: boolean };
  payments: { inApp: boolean; email: boolean };
  seller: { inApp: boolean; email: boolean };
  wishlist: { inApp: boolean };
  admin: { inApp: boolean };
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesPayload = {
  orders: { inApp: true, email: true },
  rentals: { inApp: true, email: true },
  payments: { inApp: true, email: true },
  // Seller email defaults to **off**. Order and rental email is something a customer
  // asked for by buying something; a seller receives these passively, and defaulting
  // it on would opt every seller into a stream they did not choose.
  seller: { inApp: true, email: false },
  wishlist: { inApp: true },
  admin: { inApp: true },
};

function toPreferencesPayload(
  row: typeof notificationPreferences.$inferSelect | undefined,
): NotificationPreferencesPayload {
  if (!row) return DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    orders: { inApp: row.ordersInApp, email: row.ordersEmail },
    rentals: { inApp: row.rentalsInApp, email: row.rentalsEmail },
    payments: { inApp: row.paymentsInApp, email: row.paymentsEmail },
    seller: { inApp: row.sellerInApp, email: row.sellerEmail },
    wishlist: { inApp: row.wishlistInApp },
    admin: { inApp: row.adminInApp },
  };
}

/** Effective preferences. A user with no row gets every category on. */
export async function readNotificationPreferences(
  userId: number,
): Promise<NotificationPreferencesPayload> {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return toPreferencesPayload(row);
}

/**
 * Upsert preferences.
 *
 * Written as `insert … on duplicate key update` rather than read-then-branch, because
 * two tabs saving different categories at the same moment must not have the second
 * write silently discard the first one's change.
 *
 * Only the columns present in `input` are touched, so a settings screen that saves
 * the `wishlist` group does not reset a `payments` change the user made a moment ago
 * in another tab.
 */
export async function writeNotificationPreferences(
  userId: number,
  input: {
    orders?: Partial<{ inApp: boolean; email: boolean }>;
    rentals?: Partial<{ inApp: boolean; email: boolean }>;
    payments?: Partial<{ inApp: boolean; email: boolean }>;
    seller?: Partial<{ inApp: boolean; email: boolean }>;
    wishlist?: { inApp: boolean };
    admin?: { inApp: boolean };
  },
): Promise<NotificationPreferencesPayload> {
  const now = new Date();
  const values: typeof notificationPreferences.$inferInsert = { userId, createdAt: now, updatedAt: now };

  const assign = (
    inApp: boolean | undefined,
    email: boolean | undefined,
    inAppColumn: "ordersInApp" | "rentalsInApp" | "paymentsInApp" | "sellerInApp",
    emailColumn: "ordersEmail" | "rentalsEmail" | "paymentsEmail" | "sellerEmail",
  ) => {
    if (inApp !== undefined) values[inAppColumn] = inApp;
    if (email !== undefined) values[emailColumn] = email;
  };

  assign(input.orders?.inApp, input.orders?.email, "ordersInApp", "ordersEmail");
  assign(input.rentals?.inApp, input.rentals?.email, "rentalsInApp", "rentalsEmail");
  assign(input.payments?.inApp, input.payments?.email, "paymentsInApp", "paymentsEmail");
  assign(input.seller?.inApp, input.seller?.email, "sellerInApp", "sellerEmail");
  if (input.wishlist?.inApp !== undefined) values.wishlistInApp = input.wishlist.inApp;
  if (input.admin?.inApp !== undefined) values.adminInApp = input.admin.inApp;

  await db
    .insert(notificationPreferences)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        ordersInApp: values.ordersInApp,
        ordersEmail: values.ordersEmail,
        rentalsInApp: values.rentalsInApp,
        rentalsEmail: values.rentalsEmail,
        sellerInApp: values.sellerInApp,
        sellerEmail: values.sellerEmail,
        paymentsInApp: values.paymentsInApp,
        paymentsEmail: values.paymentsEmail,
        wishlistInApp: values.wishlistInApp,
        adminInApp: values.adminInApp,
        updatedAt: now,
      },
    });

  return readNotificationPreferences(userId);
}