import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { forgetNotification, syncNotifications } from "@/lib/tanstack-db/sync";
import {
  dismissNotification,
  getNotificationPreferences,
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  saveNotificationPreferences,
  setNotificationRead,
} from "./api";
import type {
  NotificationFilters,
  NotificationItem,
  NotificationPage,
  NotificationPreferences,
} from "./types";

/**
 * Notification queries and mutations.
 *
 * ## Two caches, one truth
 *
 * The **feed** (`notificationsList`) and the **badge** (`notificationUnreadCount`) are
 * separate query entries on purpose. They are answers to different questions and they
 * have different lifetimes: the feed is a paged list a user scrolls, the badge is one
 * integer that lives in the header on every page. Deriving the badge from the feed
 * means the header refetches twenty notifications on every navigation to render a
 * digit, and — worse — that the badge silently reads `0` for anyone whose unread rows
 * are older than the current page. The server owns the count (`countUnread`), and this
 * module mirrors it rather than computing it.
 *
 * ## Optimistic where it is safe
 *
 * Read state and dismissal are **optimistic with rollback**: both are reversible
 * (mark-unread exists) and both are things a user has explicitly asked for, so the
 * interface should respond to the click rather than to a round trip. Every *write* is
 * still reconciled against the server afterwards, which is what catches the case the
 * optimistic update cannot know about — a notification that was never delivered, or a
 * concurrent "mark all read" landing first.
 */

/** The feed's own stale time. Notifications arrive, but not by the dozen. */
export const NOTIFICATIONS_STALE_MS = 20_000;

/**
 * The badge's stale time, and the interval it re-checks on.
 *
 * Deliberately shorter than the feed's. A notification the user cannot see is one
 * they will believe did not happen, and the badge is the only always-visible surface
 * that can say otherwise. 30s matches the poll the header used before this feature
 * existed, so this is not a new load on the API — it is the same one, under a name
 * that means something.
 */
export const UNREAD_POLL_MS = 30_000;

/** The header's badge, on its own endpoint. Enabled only when signed in. */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notificationUnreadCount,
    queryFn: getUnreadCount,
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    // The badge must survive a re-mount of the header without a flash of "0", and a
    // 30s-old number is not worth a spinner in the corner of the page.
    staleTime: UNREAD_POLL_MS,
  });
}

/**
 * One page of the feed.
 *
 * Rows are mirrored into the reactive store on the way through, so the header's
 * dropdown and the full page read the same rows rather than two fetches that can
 * disagree about what is unread.
 */
export function useNotifications(filters: NotificationFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.notificationsList(filters),
    queryFn: async (): Promise<NotificationPage> => {
      const page = await getNotifications(filters);
      syncNotifications(page.items);
      return page;
    },
    enabled,
    staleTime: NOTIFICATIONS_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

/** The dropdown's own small page — same endpoint, fewer rows. */
export function useRecentNotifications(enabled: boolean, size = 8) {
  return useNotifications({ page: 1, pageSize: size }, enabled);
}

/** The signed-in user's effective channel settings. */
export function useNotificationPreferences(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: getNotificationPreferences,
    enabled,
    // Preferences change rarely and only by this user, so they are cached hard.
    staleTime: 5 * 60_000,
  });
}

/* -------------------------------- mutations -------------------------------- */

/**
 * Reconcile everything a notification write could have changed.
 *
 * All three entries, always: a single read toggle changes the row (feed), the digit
 * (badge) and — for "mark all read" — nothing at all about preferences. Narrowing this
 * per mutation is the kind of optimisation that is right for two of the three and
 * quietly wrong for the third, so the rule is one function and every write calls it.
 */
export function invalidateNotifications(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
}

/**
 * Write the server's authoritative unread count into the badge entry.
 *
 * Every write endpoint returns the new count (`unread` on the read and delete
 * handlers, `0` for read-all). Using it means the badge jumps straight to the truth
 * instead of waiting out a refetch round trip — and, on read-all, instead of being
 * optimistically set to zero and being *wrong* if another tab's notification arrives a
 * second later.
 */
function setBadgeFromServer(queryClient: QueryClient, unread: number | undefined): void {
  if (typeof unread !== "number") return;
  queryClient.setQueryData(queryKeys.notificationUnreadCount, unread);
}

/**
 * Step the cached badge in the direction of the change the user just made.
 *
 * Direction-aware, and it has to be: "mark read" on an already-read row must not
 * decrement the badge, and "mark unread" on an unread row must not increment it. A
 * single `-1` would be wrong half the time — and the badge is the one number a user
 * is looking at while making these clicks.
 */
function stepBadge(queryClient: QueryClient, delta: 1 | -1): void {
  const current = queryClient.getQueryData(queryKeys.notificationUnreadCount);
  if (typeof current !== "number") return;
  queryClient.setQueryData(queryKeys.notificationUnreadCount, Math.max(0, current + delta));
}

/**
 * Patch one notification's read state in every cached page.
 *
 * The feed is stored under one prefix per filter combination, so this uses
 * `setQueriesData` across the whole list prefix rather than trying to enumerate pages:
 * filtering is part of the key, so "the page it is on" is not something the caller
 * knows.
 */
function patchReadState(queryClient: QueryClient, id: number, isRead: boolean): void {
  queryClient.setQueriesData({ queryKey: queryKeys.notificationsListRoot }, (old: unknown) =>
    patchPageItem(old, id, (item) => ({ ...item, isRead })),
  );
}

/** Apply `change` to the item with `id` inside a cached page payload. */
function patchPageItem(
  old: unknown,
  id: number,
  change: (item: NotificationItem) => NotificationItem,
): unknown {
  if (!old || typeof old !== "object") return old;
  const page = old as NotificationPage;
  if (!Array.isArray(page.items)) return old;
  return {
    ...page,
    items: page.items.map((item) => (item.id === id ? change(item) : item)),
  };
}

/**
 * Mark one notification read or unread.
 *
 * Optimistic, with a real rollback: `onMutate` flips the row and steps the badge down
 * (or up), `onError` restores both from the snapshot, and `onSettled` invalidates so
 * the server has the last word. The rollback matters most for "mark unread" — without
 * it a failed re-read would leave the badge permanently one too low with nothing to
 * correct it until the next poll.
 */
export function useSetNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, read }: { id: number; read: boolean; wasRead: boolean }) =>
      setNotificationRead(id, read),

    onMutate: async ({ id, read, wasRead }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previousPages = queryClient.getQueriesData({
        queryKey: queryKeys.notificationsListRoot,
      });
      const previousUnread = queryClient.getQueryData(queryKeys.notificationUnreadCount);

      patchReadState(queryClient, id, read);
      // Step the badge only when this is a genuine transition. Clicking "mark read" on
      // an already-read row, or "mark unread" on an unread one, is a no-op and must
      // leave the number alone — and `wasRead` is what distinguishes the two, since
      // the optimistic write happens before the server has answered.
      if (read !== wasRead) stepBadge(queryClient, read ? -1 : 1);

      return { previousPages, previousUnread };
    },

    onError: (error, _variables, context) => {
      for (const [key, value] of context?.previousPages ?? []) {
        queryClient.setQueryData(key, value);
      }
      if (context?.previousUnread !== undefined) {
        queryClient.setQueryData(queryKeys.notificationUnreadCount, context.previousUnread);
      }
      toast(notificationErrorMessage(error), {
        description: "Your notifications were not changed.",
      });
    },

    onSuccess: (result) => setBadgeFromServer(queryClient, result.unread),
    onSettled: () => invalidateNotifications(queryClient),
  });
}

/**
 * Dismiss one notification.
 *
 * The one mutation that removes rather than edits, so its optimistic write is a
 * deletion from the store and the cached pages. A dismissal the user made should not
 * linger on screen for the length of a request, and the row is gone on the server
 * either way.
 */
export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: number; wasRead: boolean }) => dismissNotification(id),

    onMutate: async ({ id, wasRead }: { id: number; wasRead: boolean }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications });
      const previousPages = queryClient.getQueriesData({
        queryKey: queryKeys.notificationsListRoot,
      });
      const previousUnread = queryClient.getQueryData(queryKeys.notificationUnreadCount);

      // The row leaves the store *and* every cached page, so a dismissal shows
      // immediately rather than after a refetch round trip.
      forgetNotification(id);
      queryClient.setQueriesData({ queryKey: queryKeys.notificationsListRoot }, (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const page = old as NotificationPage;
        if (!Array.isArray(page.items)) return old;
        return { ...page, items: page.items.filter((item) => item.id !== id) };
      });
      // Dismissing an *unread* row takes it out of the unread set; dismissing a read one
      // does not, which is why the caller's `wasRead` is needed here.
      if (!wasRead) stepBadge(queryClient, -1);

      return { previousPages, previousUnread };
    },

    onError: (error, _id, context) => {
      for (const [key, value] of context?.previousPages ?? []) {
        queryClient.setQueryData(key, value);
      }
      if (context?.previousUnread !== undefined) {
        queryClient.setQueryData(queryKeys.notificationUnreadCount, context.previousUnread);
      }
      toast(notificationErrorMessage(error), { description: "That notification is still here." });
    },

    onSuccess: (result) => {
      setBadgeFromServer(queryClient, result.unread);
      toast("Notification dismissed");
    },
    onSettled: () => invalidateNotifications(queryClient),
  });
}

/**
 * Mark everything read.
 *
 * Not optimistic on the rows, and the asymmetry is deliberate. "Mark all read" is a
 * bulk action over a set the user has not necessarily seen, so optimistically blanking
 * every row would be asserting something about rows this client has never read — and
 * if the request failed, restoring them is a worse experience than waiting. The badge,
 * on the other hand, *is* optimistic: it is a single number the user just acted on, and
 * the server's own `unread` (always `0`) replaces it moments later.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationUnreadCount });
      queryClient.setQueryData(queryKeys.notificationUnreadCount, 0);
    },
    onError: (error) => {
      toast(notificationErrorMessage(error), {
        description: "Your notifications were not changed.",
      });
      invalidateNotifications(queryClient);
    },
    onSuccess: () => toast("All notifications marked as read"),
    onSettled: () => invalidateNotifications(queryClient),
  });
}

/**
 * Save channel preferences.
 *
 * Optimistic in the form's own terms: the switches move immediately because a user
 * dragging a toggle is watching the toggle, not waiting for it. Rolled back on
 * failure, and reconciled afterwards so the server's merged view wins — which matters
 * because the PATCH is a partial upsert and the response is the whole row.
 */
export function useSaveNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      preferences: Partial<{
        orders: { inApp?: boolean; email?: boolean };
        rentals: { inApp?: boolean; email?: boolean };
        payments: { inApp?: boolean; email?: boolean };
        seller: { inApp?: boolean; email?: boolean };
        wishlist: { inApp: boolean };
        admin: { inApp: boolean };
      }>,
    ) => saveNotificationPreferences(preferences),

    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationPreferences });
      const previous = queryClient.getQueryData<NotificationPreferences>(
        queryKeys.notificationPreferences,
      );
      // Merge per field, not per category: the request may carry only `orders.inApp`,
      // and replacing the category wholesale would blank the email switch beside it.
      queryClient.setQueryData<NotificationPreferences>(
        queryKeys.notificationPreferences,
        (old) =>
          old
            ? Object.fromEntries(
                Object.entries(old).map(([category, channel]) => [
                  category,
                  { ...channel, ...(next as Record<string, object>)[category] },
                ]),
              ) as unknown as NotificationPreferences
            : old,
      );
      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notificationPreferences, context.previous);
      }
      toast(notificationErrorMessage(error), { description: "Your settings were not saved." });
    },

    onSuccess: (saved) => {
      // The response is the whole merged row, so it replaces rather than merges.
      queryClient.setQueryData(queryKeys.notificationPreferences, saved);
      toast("Notification settings saved");
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences });
    },
  });
}

/* ---------------------------------- errors ---------------------------------- */

/**
 * A notification error as a sentence.
 *
 * The server already writes these for a human — "Notification not found." is more
 * useful than anything this layer could invent — so an `ApiError`'s message is passed
 * through and only a non-API failure gets a generic fallback.
 */
export function notificationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

export type { NotificationFilters, NotificationItem, NotificationPreferences };