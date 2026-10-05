/**
 * Messaging types.
 *
 * These mirror the server's `server/lib/messaging.ts` payloads. Two fields deserve
 * their explanation here because they are the reason the client can be *small*:
 *
 *  - `isMine` / `otherUserIsSeller` are computed **server-side**, from the session user.
 *    The client is handed a boolean instead of a sender id to compare against its own
 *    session, which means there is no window in which a stale `useAuth()` value would
 *    render somebody else's messages as the current user's own.
 *  - `unread` is a per-conversation count the server derived from
 *    `conversationParticipants.lastReadAt`, not something the client counts.
 */
export type ConversationParticipant = {
  id: number;
  name: string;
  avatarUrl: string | null;
  /** True when this participant owns the listing the thread is about. */
  isSeller: boolean;
};

/** One row of `GET /api/conversations`. */
export type ConversationSummary = {
  conversationId: number;
  productId: number | null;
  productTitle: string | null;
  productSlug: string | null;
  orderId: number | null;
  orderNumber: string | null;
  rentalId: number | null;
  lastMessageAt: string;
  /** Preview of the newest message, or `null` for an empty thread. */
  lastMessageBody: string | null;
  /** Whether the newest message came from the other participant; `null` when empty. */
  lastMessageIsMine: boolean | null;
  /** Messages from the other participant since this user's read marker. */
  unread: number;
  otherUser: ConversationParticipant | null;
  /** Whether the counterparty is the listing's seller — drives the workspace label. */
  otherUserIsSeller: boolean;
};

/** One message of `GET /api/conversations/:id/messages`. */
export type MessageRecord = {
  id: number;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
  /** Server-resolved against the session, so the client never compares user ids. */
  isMine: boolean;
};

/** What a new thread may be attached to — every value already authorized server-side. */
export type ConversationContext = {
  orders: { id: number; orderNumber: string | null }[];
  rentals: { id: number; endDate: string }[];
};

/** What `POST /api/conversations` returns. */
export type StartedConversation = {
  conversationId: number;
  messageId: number;
};

/** The body of a first message. No user id — the counterparty comes from the listing. */
export type StartConversationInput = {
  productId: number;
  body: string;
  orderId?: number;
  rentalId?: number;
};