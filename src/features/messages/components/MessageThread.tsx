import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import type { MessageRecord } from "../types";
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_WARN_LENGTH,
  clockTime,
  draftProblem,
  groupMessagesByDay,
  isPendingMessage,
} from "./schema";

/**
 * One conversation's transcript and composer.
 *
 * ## Scroll behaviour, which is the part that is actually hard
 *
 * A transcript that always scrolls to the bottom is worse than one that never does:
 * the user scrolls up to re-read something, a 10s poll delivers an unrelated message,
 * and the view yanks them to the bottom mid-sentence. So this tracks whether the user is
 * *near* the bottom and only auto-scrolls when they are.
 *
 * `useLayoutEffect` rather than `useEffect` for the jump: a layout effect runs before
 * paint, so the scroll does not show as a visible settle on every poll.
 *
 * ## The composer stays enabled while sending
 *
 * `aria-disabled` rather than `disabled` on the textarea, because a user waiting for a
 * message to go out usually starts typing the next one. Taking the keyboard away from
 * them for the length of a request is a worse answer than letting them queue it up; the
 * send button is genuinely disabled, and the hint line says what is happening.
 */
export function MessageThread({
  messages,
  draft,
  onDraftChange,
  onSend,
  isSending = false,
  isLoading = false,
  isError = false,
  onRetry,
  header,
}: {
  messages: MessageRecord[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  isSending?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Rendered above the transcript — who this thread is with, and about what. */
  header?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const problem = draftProblem(draft, isSending);
  const length = draft.trim().length;
  const remaining = MESSAGE_MAX_LENGTH - length;

  // Track "is the user at the bottom" on every scroll, so the auto-scroll below knows
  // whether it should intervene. 80px is roughly three lines — close enough that
  // nudging the wheel counts as "still at the bottom", far enough that scrolling up to
  // re-read something does not.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onScroll = () => {
      atBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !atBottomRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a newline — the convention, and the only one where
    // the keyboard shortcut and the visible control agree about what will happen.
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (problem) return;
    onSend();
  }

  return (
    <Card className="flex max-h-[34rem] min-h-[24rem] flex-col overflow-hidden p-0">
      {header && <div className="border-b border-border/60 px-4 py-3">{header}</div>}

      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto p-4">
        {isLoading ? (
          <TranscriptSkeleton />
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle size={22} className="text-destructive" aria-hidden />
            <p className="text-sm font-bold">Couldn&apos;t load this conversation</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              It may have been removed, or you may not be part of it.
            </p>
            {onRetry && (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-bold">No messages yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Say hello — asking about availability, condition or delivery is what this
              thread is for.
            </p>
          </div>
        ) : (
          groupMessagesByDay(messages).map((group) => (
            <section key={group.day}>
              <h3 className="my-3 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {group.day}
              </h3>
              <ul className="space-y-1.5">
                {group.messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn("flex", message.isMine ? "justify-end" : "justify-start")}
                  >
                    <Bubble message={message} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder="Type a message…"
              aria-label="Message"
              aria-disabled={isSending}
              className="resize-none"
            />
            <div className="mt-1 flex items-center justify-between gap-2 px-1">
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  problem ? "text-destructive" : "text-muted-foreground",
                )}
                role={problem ? "status" : undefined}
              >
                {problem ?? "Enter to send · Shift+Enter for a new line"}
              </span>
              {length > MESSAGE_WARN_LENGTH && (
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {remaining} left
                </span>
              )}
            </div>
          </div>
          <Button
            size="icon"
            aria-label="Send message"
            disabled={Boolean(problem)}
            onClick={onSend}
            className="size-11 shrink-0"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * One bubble.
 *
 * Alignment and colour come from `isMine` — the server's answer — rather than from
 * comparing `senderId` against a user id held in the browser. The consequence that
 * matters is that a stale session can never render somebody else's message as the
 * current user's own.
 */
function Bubble({ message }: { message: MessageRecord }) {
  const pending = isPendingMessage(message);

  return (
    <div
      className={cn(
        "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm",
        message.isMine ? "primary-button text-primary-foreground" : "inset-surface",
      )}
    >
      {!message.isMine && (
        <p className="mb-0.5 text-[11px] font-bold text-primary">{message.senderName}</p>
      )}
      {/* `whitespace-pre-wrap` so a message the user typed across two lines arrives as
          two lines, rather than being reflowed into one. */}
      <p className="break-words whitespace-pre-wrap">{message.body}</p>
      <span
        className={cn(
          "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
          message.isMine ? "opacity-75" : "text-muted-foreground",
        )}
      >
        {clockTime(message.createdAt)}
        {pending && (
          <span aria-label="Sending">
            · sending…
          </span>
        )}
      </span>
    </div>
  );
}

/** Bubbles shown while the transcript loads — alternating so the shape reads as a chat. */
function TranscriptSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className={cn("flex", index % 2 === 0 ? "justify-start" : "justify-end")}>
          <div
            className={cn(
              "h-10 w-2/5 animate-pulse rounded-2xl",
              index % 2 === 0 ? "bg-muted" : "bg-primary/20",
            )}
          />
        </li>
      ))}
    </ul>
  );
}