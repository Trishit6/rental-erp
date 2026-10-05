import { api } from "@/lib/api/client";
import type {
  ConversationContext,
  ConversationSummary,
  MessageRecord,
  StartConversationInput,
  StartedConversation,
} from "./types";

/**
 * Every network call the messaging feature makes.
 *
 * ## No user ids, anywhere
 *
 * There is no `sellerId`, no `recipientId`, no `userId` in any of these signatures, and
 * that is the security model rather than an oversight. `POST /api/conversations` takes
 * a **product**; the server resolves the counterparty from `products.sellerId`
 * (`assertCanContactSeller`) and refuses the request if the caller is not a genuine
 * counterparty of that listing. A client therefore cannot craft a request body that
 * opens a channel to another customer, because there is no field to name one.
 *
 * Reads are the same: `GET /api/conversations/:id/messages` authorizes inside
 * `requireParticipation` (`server/lib/messaging.ts`) and answers 403 for an id the
 * caller is not in. A conversation id is not a capability.
 */

/** `GET /api/conversations` — every thread the session user is in. */
export async function getConversations(): Promise<ConversationSummary[]> {
  return (await api.get<ConversationSummary[]>("/conversations")).data;
}

/** `GET /api/conversations/:id/messages` — the transcript, oldest first. */
export async function getMessages(conversationId: number): Promise<MessageRecord[]> {
  return (await api.get<MessageRecord[]>(`/conversations/${conversationId}/messages`)).data;
}

/** `POST /api/conversations/:id/read` — re-stamp the read marker on a refocus. */
export async function markConversationRead(conversationId: number): Promise<void> {
  await api.post(`/conversations/${conversationId}/read`);
}

/**
 * `POST /api/conversations` — open (or resume) a thread about a listing.
 *
 * The body is `.strict()` server-side, so an unexpected key is a 400 rather than a
 * silently ignored field — which matters here, because a caller that sent a `sellerId`
 * out of habit would otherwise believe it had addressed somebody.
 */
export async function startConversation(input: StartConversationInput): Promise<StartedConversation> {
  return (await api.post<StartedConversation>("/conversations", input)).data;
}

/** `POST /api/conversations/:id/messages` — append to an existing thread. */
export async function sendMessage(conversationId: number, body: string): Promise<MessageRecord> {
  return (await api.post<MessageRecord>(`/conversations/${conversationId}/messages`, { body })).data;
}

/**
 * `GET /api/conversations/context` — the orders and rentals this thread may name.
 *
 * Only ids the same checks as the write path have approved, so the picker cannot offer
 * something the server would then refuse.
 */
export async function getConversationContext(): Promise<ConversationContext> {
  return (await api.get<ConversationContext>("/conversations/context")).data;
}