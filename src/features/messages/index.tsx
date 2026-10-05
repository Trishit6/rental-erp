import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { MessageCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/shared/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { forgetConversationMessages } from "@/lib/tanstack-db/sync";
import {
  useConversations,
  useMessages,
  useSendMessage,
} from "./query";
import type { ConversationSummary } from "./types";
import {
  ConversationList,
  ConversationListSkeleton,
  ConversationSearch,
} from "./components/ConversationList";
import { MessageThread } from "./components/MessageThread";
import { conversationSubject, filterConversations } from "./components/schema";

/**
 * `/messages` — the conversation centre.
 *
 * Reached from the header's Profile menu and from a notification about a new message.
 * The dashboard route renders this same component, so a seller and a customer see the
 * identical inbox rather than two implementations of it.
 *
 * ## The open thread lives in the URL
 *
 * `?conversation=<id>` is the selection. That makes a thread linkable — which is what a
 * `MESSAGE_RECEIVED` notification points at, and what lets a user share or bookmark a
 * thread — and it is why the conversation list uses buttons rather than links: selecting
 * is this page's business, and the page writes the URL.
 *
 * ## Auto-select, but only once
 *
 * Landing on the page with nothing open and picking the newest thread is what a user
 * expects from a two-pane inbox. It happens only when there is no selection *and* the
 * list has loaded, so it never fights a selection the user has already made, and never
 * fires before the list is known to be non-empty.
 */
export function MessagesPage() {
  const search = useSearch({ strict: false }) as { conversation?: number };
  const navigate = useNavigate();

  const { data: conversations, isLoading, isError, refetch } = useConversations(true);
  const activeId = typeof search.conversation === "number" ? search.conversation : null;

  const [term, setTerm] = useState("");
  const [draft, setDraft] = useState("");

  // Resolved once rather than at each use: `isLoading`/`isError` do not narrow
  // `conversations`, so the empty state below would otherwise have to re-assert `?? []`
  // in the one branch where it reads `conversations.length`. One value, one meaning.
  // `useMemo` so the `?? []` fallback does not produce a new array every render and
  // invalidate the filter memo below on each one.
  const list = useMemo(() => conversations ?? [], [conversations]);

  const visible = useMemo(() => filterConversations(list, term), [list, term]);

  // Auto-select the newest thread when nothing is open. `[conversations]` in the
  // dependency list, not `[visible]` — searching must not re-pick the selection, and
  // `activeId` is deliberately not a dependency so this cannot loop.
  useEffect(() => {
    if (activeId !== null || !conversations || conversations.length === 0) return;
    const newest = [...conversations].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    )[0];
    if (!newest) return;
    void navigate({
      to: "/messages",
      search: { conversation: newest.conversationId },
      replace: true,
    });
  }, [conversations, activeId, navigate]);

  const active = conversations?.find((row) => row.conversationId === activeId) ?? null;

  /**
   * Drop the transcript from the reactive store when this page is left.
   *
   * The page renders from the query cache, not the store, so this changes nothing on
   * screen — it exists so the most sensitive rows in the application (private message
   * bodies) do not outlive the screen that fetched them, mirroring how
   * `clearPrivateCollections` wipes them on logout. The conversation *list* is
   * deliberately left: it is a set of names and counts, and the store is a mirror
   * rather than a cache, so a stale list is corrected by the next fetch.
   *
   * An empty dependency list, because "left the page" is exactly unmount. Clearing on
   * each `activeId` change would be redundant — `syncMessages` already replaces the whole
   * collection when the next thread's transcript arrives.
   */
  useEffect(() => () => forgetConversationMessages(), []);

  const {
    data: messages,
    isLoading: isLoadingMessages,
    isError: isMessagesError,
    refetch: refetchMessages,
  } = useMessages(activeId, activeId !== null);

  const send = useSendMessage();

  async function handleSend() {
    if (activeId === null) return;
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await send.mutateAsync({ conversationId: activeId, body });
    } catch {
      // Put the text back. A lost draft is worse than any error message: the user would
      // have to reconstruct what they typed, and the server's reason is already in the
      // toast raised by the mutation.
      setDraft(body);
    }
  }

  return (
    <div className="page-wrap max-w-6xl space-y-6 pb-12 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title text-3xl">Messages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Talk to sellers about their listings, and to customers about yours.
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <ConversationListSkeleton />
          <div className="inset-surface min-h-[24rem] animate-pulse rounded-3xl" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={MessageCircle}
          title="Couldn't load your messages"
          description="Check your connection and try again."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="Use “Message seller” on any product page to start a conversation. Ask about condition, availability or delivery."
          action={
            <Button asChild size="sm">
              <Link to="/browse">Browse listings</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-3">
            <ConversationSearch value={term} onChange={setTerm} />
            {visible.length === 0 ? (
              <p className="inset-surface rounded-3xl px-4 py-8 text-center text-xs text-muted-foreground">
                No conversations match “{term}”.
              </p>
            ) : (
              <ConversationList
                conversations={visible}
                activeId={activeId}
                onSelect={(id) =>
                  void navigate({
                    to: "/messages",
                    search: { conversation: id },
                    replace: false,
                  })
                }
              />
            )}
          </div>

          {activeId === null ? (
            <div className="inset-surface flex min-h-[24rem] items-center justify-center rounded-3xl p-10 text-center text-sm text-muted-foreground">
              Choose a conversation to start reading.
            </div>
          ) : (
            <MessageThread
              messages={messages ?? []}
              draft={draft}
              onDraftChange={setDraft}
              onSend={() => void handleSend()}
              isSending={send.isPending}
              isLoading={isLoadingMessages}
              isError={isMessagesError}
              onRetry={() => void refetchMessages()}
              header={<ThreadHeader conversation={active} conversationId={activeId} />}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The thread's header: who this is with, and what it is about.
 *
 * The listing link is what makes a thread about a *product* rather than an anonymous
 * conversation — a buyer returning six months later needs to get back to the item they
 * asked about, and the thread itself is not that.
 */
function ThreadHeader({
  conversation,
  conversationId,
}: {
  conversation: ConversationSummary | null;
  conversationId: number;
}) {
  const name = conversation?.otherUser?.name ?? "This conversation";

  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} url={conversation?.otherUser?.avatarUrl ?? null} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {conversation ? conversationSubject(conversation) : `Conversation #${conversationId}`}
        </p>
      </div>
      {conversation?.productSlug && (
        <Button asChild variant="secondary" size="sm">
          <Link to="/product/$slug" params={{ slug: conversation.productSlug }}>
            <Package size={14} aria-hidden />
            <span className="hidden sm:inline">View listing</span>
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Kept as a named export because the seller dashboard route already imports it, and
 * there is exactly one messages page in this application — two components would be two
 * implementations of one inbox.
 */
export const DashboardMessagesPage = MessagesPage;