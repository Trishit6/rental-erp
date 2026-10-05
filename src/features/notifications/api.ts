import { api } from "@/lib/api/client";
import type {
  NotificationFilters,
  NotificationMutationResult,
  NotificationPage,
  NotificationPreferences,
} from "./types";

/**
 * Every network call the notifications feature makes.
 *
 * Nothing here sends a user id. The session cookie is the only thing that identifies
 * the recipient, so there is no request body a client could craft to read or write
 * somebody else's feed — which is why `PATCH /notifications/:id/read` is safe to
 * expose directly to the UI without a "is this mine?" check on the client.
 *
 * Components never call this file; they use the hooks in `./query`.
 */

/** Query string for one page of the feed. */
function toQueryString(filters: NotificationFilters): string {
  const params = new URLSearchParams();
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.unreadOnly) params.set("unread", "true");
  if (filters.category) params.set("category", filters.category);
  return params.toString();
}

/**
 * `GET /api/notifications` — one page of the feed.
 *
 * Filtered and paginated in SQL. The previous implementation returned a fixed
 * fifty rows with no filters and no total, so the bell could show ten of the fifty
 * most recent and there was no way to reach an older one.
 */
export async function getNotifications(filters: NotificationFilters = {}): Promise<NotificationPage> {
  const query = toQueryString(filters);
  return (await api.get<NotificationPage>(`/notifications${query ? `?${query}` : ""}`)).data;
}

/**
 * `GET /api/notifications/unread-count` — the badge's number, on its own.
 *
 * A dedicated endpoint because the bell is on every page: making the badge depend on
 * a 20-row list response would mean transferring, parsing and discarding twenty
 * notifications on each navigation to render one digit.
 */
export async function getUnreadCount(): Promise<number> {
  return (await api.get<{ unread: number }>("/notifications/unread-count")).data.unread;
}

/** `GET /api/notifications/preferences` — effective settings, defaults filled in. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return (await api.get<NotificationPreferences>("/notifications/preferences")).data;
}

/**
 * `PATCH /api/notifications/preferences` — save channel settings.
 *
 * `Partial` at the top level on purpose: the server's upsert only touches the columns
 * present in the body, so sending one group cannot reset another group changed in
 * another tab. This type is the client half of that guarantee.
 */
export async function saveNotificationPreferences(
  preferences: Partial<{
    orders: { inApp?: boolean; email?: boolean };
    rentals: { inApp?: boolean; email?: boolean };
    payments: { inApp?: boolean; email?: boolean };
    seller: { inApp?: boolean; email?: boolean };
    wishlist: { inApp: boolean };
    admin: { inApp: boolean };
  }>,
): Promise<NotificationPreferences> {
  return (await api.patch<NotificationPreferences>("/notifications/preferences", preferences))
    .data;
}

/**
 * `PATCH /api/notifications/:id/read` — mark one read or unread.
 *
 * Both directions are supported: a user who taps a notification by accident needs a
 * way back, and a system that only moves forward cannot offer one.
 */
export async function setNotificationRead(
  id: number,
  read: boolean,
): Promise<NotificationMutationResult> {
  return (await api.patch<NotificationMutationResult>(`/notifications/${id}/read`, { read })).data;
}

/**
 * `POST /api/notifications/read-all` — clear the whole unread set.
 *
 * Returns the server's new unread count rather than a boolean, so the badge is set
 * from a value the server computed instead of a hard-coded `0` that is wrong the
 * instant something else arrives.
 */
export async function markAllNotificationsRead(): Promise<NotificationMutationResult> {
  return (await api.post<NotificationMutationResult>("/notifications/read-all")).data;
}

/** `DELETE /api/notifications/:id` — dismiss one permanently. */
export async function dismissNotification(id: number): Promise<NotificationMutationResult> {
  return (await api.delete<NotificationMutationResult>(`/notifications/${id}`)).data;
}