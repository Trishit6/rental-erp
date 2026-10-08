import { CheckCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  useDismissNotification,
  useMarkAllNotificationsRead,
  useNotifications,
  useSetNotificationRead,
} from "@/features/notifications/query";
import { NotificationRow, NotificationRowSkeleton } from "@/features/notifications/components/NotificationRow";
import { AdminPageHeader } from "../components/AdminLayout";
import { AdminErrorState } from "../components/AdminErrorState";

/**
 * `/admin/notifications` — the administrator's own feed, in the workspace.
 *
 * ## Why the admin has a notifications page at all
 *
 * Notifications are user-scoped: an administrator receives platform emails (new
 * report, payout reviewed, listing reported) as their own account's rows, exactly
 * like a customer receives order updates. The workspace's Platform section pages
 * that feed here so the topbar bell lands *inside* the workspace instead of
 * dropping out to the storefront.
 *
 * Everything on the page is the real, server-authoritative feed — the same
 * `GET /api/notifications` the storefront reads, re-keyed under the admin cache —
 * with the same read/dismiss/mark-all actions.
 */
export function AdminNotificationsPage() {
  const { data, isLoading, isError, refetch } = useNotifications(
    { page: 1, pageSize: 20, unreadOnly: false },
    true,
  );
  const setRead = useSetNotificationRead();
  const dismiss = useDismissNotification();
  const markAll = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const unread = typeof data?.totalUnread === "number" ? data.totalUnread : 0;

  return (
    <div className="space-y-5 pb-10">
      <AdminPageHeader
        eyebrow="Platform"
        title="Notifications"
        description="Your platform alerts — reports, payouts and marketplace events for your account."
        actions={
          unread > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck size={14} aria-hidden />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {isLoading && data === undefined ? (
        <Card className="p-4">
          <NotificationRowSkeleton />
        </Card>
      ) : isError && data === undefined ? (
        <AdminErrorState
          label="Couldn’t load your notifications."
          onRetry={() => void refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No notifications yet"
          description="Platform alerts will appear here."
        />
      ) : (
        <Card className="divide-y divide-[var(--divider)] p-0">
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <NotificationRow
                  item={item}
                  isPending={
                    (setRead.isPending && setRead.variables?.id === item.id) ||
                    (dismiss.isPending && dismiss.variables?.id === item.id)
                  }
                  onToggleRead={(target) =>
                    setRead.mutate({ id: target.id, read: !target.isRead, wasRead: target.isRead })
                  }
                  onDismiss={(target) => dismiss.mutate({ id: target.id, wasRead: target.isRead })}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}