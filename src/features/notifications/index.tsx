import { useNavigate, useSearch } from "@tanstack/react-router";
import { BellOff, Inbox, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useSetNotificationRead,
  useDismissNotification,
} from "./query";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  filteredEmptyTitle,
  groupByDay,
  notificationsSubtitle,
  parseNotificationFilters,
  toNotificationUrlSearch,
} from "./components/schema";
import type { NotificationCategory } from "./types";
import { CaughtUpMark, NotificationRow, NotificationRowSkeleton } from "./components/NotificationRow";
import { NotificationPreferencesSection } from "./components/NotificationPreferencesSection";

/**
 * `/notifications` — the full feed.
 *
 * ## Filters live in the URL
 *
 * Category, unread-only and page are all search params, so the view is linkable
 * ("show me the unread payments ones") and the back button undoes a filter rather than
 * leaving the page. It also means the feed is *only* a function of the URL and the
 * session, which is what lets the filters be part of the query key and therefore
 * cached per combination instead of refetched on every click.
 *
 * Grouping into days is done on the page already fetched, not by asking the server for
 * one day at a time — see `groupByDay`.
 */
export function NotificationsPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const filters = parseNotificationFilters(search);

  const { data, isLoading, isError, refetch, isFetching } = useNotifications(filters, true);
  const setRead = useSetNotificationRead();
  const dismiss = useDismissNotification();
  const markAll = useMarkAllNotificationsRead();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const unread = data?.totalUnread ?? 0;
  const page = data?.page ?? filters.page ?? 1;
  const totalPages = data?.totalPages ?? 1;
  const hasFilters = Boolean(filters.category) || Boolean(filters.unreadOnly);

  function updateSearch(next: Partial<ReturnType<typeof parseNotificationFilters>>) {
    void navigate({
      to: "/notifications",
      search: toNotificationUrlSearch({ ...filters, ...next }),
      replace: true,
    });
  }

  return (
    <div className="page-wrap max-w-4xl space-y-6 pb-12 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title text-3xl">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {notificationsSubtitle(isLoading ? undefined : total, unread, isLoading)}
          </p>
        </div>
        {unread > 0 && (
          <Button
            variant="secondary"
            size="sm"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </Button>
        )}
      </header>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          aria-pressed={!filters.category && !filters.unreadOnly}
          onClick={() => updateSearch({ category: null, unreadOnly: false, page: 1 })}
          className={chip(!filters.category && !filters.unreadOnly)}
        >
          All
        </button>
        <button
          type="button"
          aria-pressed={Boolean(filters.unreadOnly)}
          onClick={() => updateSearch({ unreadOnly: true, page: 1 })}
          className={chip(Boolean(filters.unreadOnly))}
        >
          Unread{unread > 0 ? ` (${unread})` : ""}
        </button>
        {CATEGORY_ORDER.map((category) => (
          <button
            key={category}
            type="button"
            aria-pressed={filters.category === category}
            onClick={() =>
              updateSearch({
                category: filters.category === category ? null : category,
                page: 1,
              })
            }
            className={chip(filters.category === category)}
          >
            {CATEGORY_LABELS[category]}
          </button>
        ))}
        <LinkToSettings />
      </Card>

      {isLoading ? (
        <Card className="p-2">
          <ul>
            {Array.from({ length: 6 }, (_, index) => (
              <NotificationRowSkeleton key={index} />
            ))}
          </ul>
        </Card>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-bold">Couldn&apos;t load your notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check your connection and try again.
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      ) : items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={BellOff}
            title={filteredEmptyTitle(filters.category ?? null, Boolean(filters.unreadOnly))}
            description="Try a different filter, or clear them to see everything."
            action={
              <Button variant="secondary" size="sm" onClick={() => updateSearch({ category: null, unreadOnly: false, page: 1 })}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="No notifications yet"
            description="Order or rent something and we'll tell you here as it moves along."
          />
        )
      ) : (
        <>
          {unread === 0 && total > 0 && <CaughtUpMark />}
          <Card className="p-2">
            {groupByDay(items).map((group) => (
              <section key={group.day}>
                <h2 className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {group.day}
                </h2>
                <ul>
                  {group.items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      isPending={
                        (setRead.isPending && setRead.variables?.id === item.id) ||
                        (dismiss.isPending && dismiss.variables?.id === item.id)
                      }
                      onToggleRead={(target) =>
                        setRead.mutate({
                          id: target.id,
                          read: !target.isRead,
                          wasRead: target.isRead,
                        })
                      }
                      onDismiss={(target) =>
                        dismiss.mutate({ id: target.id, wasRead: target.isRead })
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}
          </Card>

          {isFetching && (
            <p className="text-center text-xs text-muted-foreground" aria-live="polite">
              Refreshing…
            </p>
          )}

          <Pagination page={page} totalPages={totalPages} onPageChange={(next) => updateSearch({ page: next })} />
        </>
      )}

      <NotificationPreferencesSection />
    </div>
  );
}

/** One filter chip. Kept out of the header so the row stays about behaviour. */
function chip(active: boolean): string {
  return [
    "rounded-full px-3 py-1.5 text-xs font-bold transition",
    active
      ? "primary-button text-primary-foreground"
      : "soft-button text-muted-foreground hover:text-primary",
  ].join(" ");
}

/** The jump to the settings block, so the feed's filter row is not also a menu. */
function LinkToSettings() {
  return (
    <a
      href="#notification-preferences"
      className="soft-button ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-primary"
    >
      <SlidersHorizontal size={13} aria-hidden />
      Preferences
    </a>
  );
}

export type { NotificationCategory };