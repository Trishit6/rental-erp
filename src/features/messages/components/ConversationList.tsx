import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/shared/avatar";
import { cn } from "@/lib/utils/cn";
import type { ConversationSummary } from "../types";
import { relativeTime } from "./schema";

/**
 * The thread list.
 *
 * ## What a row has to answer in one glance
 *
 * Three questions, in this order: *who*, *about what*, and *is there anything for me*.
 * The unread count is a filled pill rather than a dot because "there is one new message"
 * and "there are four new messages" are different things and a dot cannot say which.
 *
 * The unread pill is drawn from the server's `unread` count, which is derived from
 * `conversationParticipants.lastReadAt` — not from a client-side diff of what has been
 * rendered, which is how an unread badge ends up stuck on after a thread is read.
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  className,
}: {
  conversations: ConversationSummary[];
  activeId: number | null;
  onSelect: (id: number) => void;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <ul className="max-h-[34rem] overflow-y-auto p-2">
        {conversations.map((conversation) => (
          <ConversationRow
            key={conversation.conversationId}
            conversation={conversation}
            isActive={conversation.conversationId === activeId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </Card>
  );
}

/**
 * One conversation.
 *
 * A `<button>`, not a `<Link>`: selecting a thread is a state change on this page, and
 * making it a URL means a deep link could address a conversation the server has since
 * made unavailable. The messages page takes a `?conversation=` search param instead,
 * set by the page rather than by a link.
 */
function ConversationRow({
  conversation,
  isActive,
  onSelect,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
  onSelect: (id: number) => void;
}) {
  const name = conversation.otherUser?.name ?? "Revaro Support";
  const preview = conversation.lastMessageBody?.trim();
  const hasUnread = conversation.unread > 0;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.conversationId)}
        aria-current={isActive ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 rounded-2xl p-3 text-left transition",
          isActive ? "inset-surface" : "hover:bg-primary/5",
        )}
      >
        <Avatar
          name={name}
          url={conversation.otherUser?.avatarUrl ?? null}
          className="size-10 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "truncate text-sm",
                hasUnread ? "font-extrabold" : "font-semibold",
              )}
            >
              {name}
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
              {relativeTime(conversation.lastMessageAt)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">
              {conversation.productTitle ?? "Direct message"}
            </span>
            {hasUnread && (
              <span
                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground"
                aria-label={`${conversation.unread} unread`}
              >
                {conversation.unread > 99 ? "99+" : conversation.unread}
              </span>
            )}
          </span>
          {preview && (
            <span
              className={cn(
                "mt-1 block truncate text-xs",
                hasUnread ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {conversation.lastMessageIsMine ? "You: " : ""}
              {preview}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * The list's search field.
 *
 * Filters **already-loaded** conversations rather than issuing a query per keystroke:
 * the server's list is the user's whole inbox (there is no pagination to page through),
 * so a server-side search would be a request to narrow something the browser already
 * holds. It is therefore honest about what it does — it says it searches your
 * conversations, not "searches all messages".
 */
export function ConversationSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search your conversations"
        aria-label="Search your conversations"
        className="h-11 pl-10"
      />
    </div>
  );
}

/** Skeletons for the list, one per expected row, so the panel does not jump. */
export function ConversationListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="inset-surface space-y-3 p-4" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
            <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}