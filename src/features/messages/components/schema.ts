import { z } from "zod";
import type { ConversationSummary, MessageRecord } from "../types";

/**
 * The messaging feature's client-side vocabulary: the composer rule, the list filter
 * and the time formatting.
 *
 * ## Why the composer cap is enforced here *and* on the server
 *
 * The server caps `body` at 2000 to match the column, and rejects an over-long message
 * as a 400 naming the field rather than letting the driver truncate it. This cap is the
 * *friendlier* half: it stops the send button and shows a counter as the user types, so
 * they are told while typing instead of after pressing enter. Neither is redundant — the
 * client cap is a courtesy and the server cap is the rule.
 */

/** Matches `messages.body` and `sendMessageSchema` on the server. */
export const MESSAGE_MAX_LENGTH = 2000;

/** Where the counter starts warning. Three-quarters of the column. */
export const MESSAGE_WARN_LENGTH = 1500;

export const messageDraftSchema = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(MESSAGE_MAX_LENGTH, `Messages are limited to ${MESSAGE_MAX_LENGTH} characters.`);

/**
 * Why a draft cannot be sent right now, or `null` when it can.
 *
 * Returned rather than a boolean so the composer can disable the button *and* explain
 * itself — a disabled button with no reason is the most common way a form strands a
 * user who cannot work out what to do next.
 */
export function draftProblem(draft: string, isSending: boolean): string | null {
  if (isSending) return "Sending…";
  const trimmed = draft.trim();
  if (!trimmed) return "Write a message first.";
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    return `Messages are limited to ${MESSAGE_MAX_LENGTH} characters.`;
  }
  return null;
}

/**
 * Whether the composer still needs the draft preserved.
 *
 * A draft is not worth saving once it is empty or once it has been sent — persisting
 * those would restore a stale "hello?" into a thread the user has moved past.
 */
export function isWorthKeepingDraft(draft: string): boolean {
  return draft.trim().length > 0;
}

/* --------------------------------- filtering -------------------------------- */

/**
 * Narrow the loaded conversation list by the counterparty's name or the listing.
 *
 * Client-side on purpose: `GET /api/conversations` returns the user's whole inbox with
 * no pagination, so a server-side search would be a request whose only job is to
 * re-filter rows the browser already holds. The match is on both fields because a user
 * remembers a thread as "the one about the camera" at least as often as by person.
 */
export function filterConversations(
  conversations: ConversationSummary[],
  term: string,
): ConversationSummary[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return conversations;

  return conversations.filter((conversation) => {
    const name = conversation.otherUser?.name?.toLowerCase() ?? "";
    const title = conversation.productTitle?.toLowerCase() ?? "";
    return name.includes(needle) || title.includes(needle);
  });
}

/* -------------------------------- formatting -------------------------------- */

/** A short relative time for a list row — see the notifications copy for the rule. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;

  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d`;

  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** The clock time on a bubble. */
export function clockTime(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  return then.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** The day heading a run of bubbles sits under. */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const delta = Math.round((startOfToday - thenDay) / 86_400_000);

  if (delta <= 0) return "Today";
  if (delta === 1) return "Yesterday";
  if (delta < 7) return then.toLocaleDateString("en-IN", { weekday: "long" });
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
 * The transcript, split under day headings.
 *
 * Same reasoning as the notifications feed: the transcript is read oldest-first as one
 * ordered list, so the headings can be derived from the rows already fetched rather
 * than by asking the server for one day at a time.
 */
export function groupMessagesByDay(
  messages: MessageRecord[],
): { day: string; messages: MessageRecord[] }[] {
  const groups: { day: string; messages: MessageRecord[] }[] = [];
  let currentDay: string | null = null;

  for (const message of messages) {
    const day = dayHeading(message.createdAt);
    if (day !== currentDay) {
      groups.push({ day, messages: [message] });
      currentDay = day;
    } else {
      groups[groups.length - 1].messages.push(message);
    }
  }
  return groups;
}

/** Whether an optimistic row is still awaiting the server's answer. */
export function isPendingMessage(message: MessageRecord): boolean {
  return message.id < 0;
}

/** The number of unread messages across every thread — the header's badge. */
export function totalUnread(conversations: ConversationSummary[] | undefined): number {
  if (!conversations) return 0;
  return conversations.reduce((sum, conversation) => sum + conversation.unread, 0);
}

/**
 * The label for a conversation's listing.
 *
 * "Direct message" rather than an empty string when a thread has no listing attached,
 * which is the honest description: the thread exists, it just is not about a product.
 */
export function conversationSubject(conversation: ConversationSummary): string {
  if (conversation.productTitle) return conversation.productTitle;
  if (conversation.orderNumber) return `Order ${conversation.orderNumber}`;
  return "Direct message";
}