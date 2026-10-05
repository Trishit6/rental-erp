import { z } from "zod";
import { Router } from "../lib/http";
import { ok } from "../lib/api";
import { db } from "../db";
import { requireUser } from "../lib/auth";
import {
  appendMessage,
  assertCanContactSeller,
  attachBusinessContext,
  findOrCreateConversation,
  listContextReferences,
  listConversations,
  listMessages,
  markConversationRead,
  otherParticipantId,
} from "../lib/messaging";
import { notificationEventKey } from "../lib/notification-events";
import { notify } from "../lib/notifications";

/**
 * `GET|POST /api/conversations`
 *
 * ## The paths here are relative to this router's mount
 *
 * `server/index.ts` mounts this router at `/api/conversations`, so a path written as
 * `/conversations/:id/messages` would resolve to `/api/conversations/conversations/:id/messages`
 * — a URL no client calls, and every one of these endpoints answering 404. The
 * declarations below are therefore written relative to the mount (`/`, `/:id/...`),
 * which is how every other route file in this codebase is written.
 *
 * ## Authorization
 *
 * `requireUser(c)` gates the router; `requireParticipation` gates every path that
 * takes a conversation id, and it does so inside the data layer rather than here. The
 * routes accept no user identifier at all — the recipient of a new message is resolved
 * from `conversationParticipants`, and the counterparty of a new thread is resolved
 * from the listing. A client cannot name a participant, only a product and a body.
 */
export const messagesRoute = new Router();

messagesRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

/* ---------------------------------- list ----------------------------------- */

/** `GET /api/conversations` — every thread the session user is in. */
messagesRoute.get("/", async (c) => {
  const user = c.get("user")!;
  return c.json(ok(await listConversations(user)));
});

/**
 * `GET /api/conversations/context`
 *
 * The order and rental ids the session user may attach to a thread.
 *
 * Only ids the same checks as the write path have approved, so the picker cannot offer
 * something `attachBusinessContext` would then refuse — a picker that offers a value
 * and then silently drops it is worse than one that omits it.
 */
messagesRoute.get("/context", async (c) => {
  const user = c.get("user")!;
  return c.json(ok(await listContextReferences(user)));
});

/* -------------------------------- transcript -------------------------------- */

const conversationParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * `GET /api/conversations/:id/messages`
 *
 * Reading the transcript advances the reader's unread marker, which is the same
 * side-effecting read the previous implementation had and the reason the bell in the
 * conversation list clears itself when a thread is opened. There is no separate
 * "mark read" call to forget.
 */
messagesRoute.get("/:id{[0-9]+}/messages", async (c) => {
  const user = c.get("user")!;
  const { id } = conversationParams.parse(c.req.param());
  return c.json(ok(await listMessages(id, user)));
});

/** `POST /api/conversations/:id/read` — explicit re-read, for a refocus. */
messagesRoute.post("/:id{[0-9]+}/read", async (c) => {
  const user = c.get("user")!;
  const { id } = conversationParams.parse(c.req.param());
  await markConversationRead(id, user.id);
  return c.json(ok({ id, read: true }));
});

/**
 * `POST /api/conversations/:id/messages`
 *
 * `body` is `.strict()` and length-capped at 2000 to match the column, so an
 * over-long message is a 400 naming the field rather than a driver-level truncation
 * that succeeds and silently loses the end of what the user typed.
 */
const sendMessageSchema = z
  .object({
    body: z.string().trim().min(1, "Write a message first.").max(2000),
  })
  .strict();

messagesRoute.post("/:id{[0-9]+}/messages", async (c) => {
  const user = c.get("user")!;
  const { id } = conversationParams.parse(c.req.param());
  const input = sendMessageSchema.parse(await c.req.json());

  const message = await appendMessage(id, user, input.body);

  // `appendMessage` has already proved the caller is in this conversation, so the
  // recipient is a real participant rather than anything the client named.
  const recipientId = await otherParticipantId(id, user.id);
  if (recipientId !== null) {
    await notify(db, {
      userId: recipientId,
      type: "MESSAGE_RECEIVED",
      title: "New message",
      body: `${user.name} sent you a message.`,
      context: { conversationId: id },
      // One notification per message. The id is in the key, so a retried send that
      // genuinely wrote a second message still notifies once for each — while a
      // retried *request* that wrote nothing notifies zero times, because
      // `appendMessage` never ran.
      eventKey: notificationEventKey("MESSAGE_RECEIVED", id, message.id),
      relatedEntityType: "CONVERSATION",
      relatedEntityId: id,
    });
  }

  return c.json(ok(message), 201);
});

/* ---------------------------------- start ----------------------------------- */

/**
 * `POST /api/conversations` — open (or resume) a thread about a listing.
 *
 * The only entry point to messaging, and it takes a **product** rather than a
 * `sellerId`. That is the whole security model of the feature: the counterparty is
 * whatever `products.sellerId` says it is, so there is no request body a client can
 * craft to open a channel to another customer.
 *
 * The optional `orderId`/`rentalId` attach context and are verified server-side.
 */
const startConversationSchema = z
  .object({
    productId: z.number().int().positive(),
    body: z.string().trim().min(1, "Write a message first.").max(2000),
    orderId: z.number().int().positive().optional(),
    rentalId: z.number().int().positive().optional(),
  })
  .strict();

messagesRoute.post("/", async (c) => {
  const user = c.get("user")!;
  const input = startConversationSchema.parse(await c.req.json());

  const { sellerId } = await assertCanContactSeller(input.productId, user);
  const conversationId = await findOrCreateConversation(input.productId, user, sellerId);

  // The first message goes in *after* the conversation exists, and through the same
  // `appendMessage` every later message uses — so the participant check, the length
  // cap and the `lastMessageAt` bump are not re-implemented here.
  const message = await appendMessage(conversationId, user, input.body);

  await attachBusinessContext(conversationId, user, {
    orderId: input.orderId ?? null,
    rentalId: input.rentalId ?? null,
  });

  await notify(db, {
    userId: sellerId,
    type: "MESSAGE_RECEIVED",
    title: "New message",
    body: `${user.name} sent you a message.`,
    context: { conversationId },
    // Keyed on the message id, not the conversation: asking twice about the same
    // listing is a legitimate second message and must notify again.
    eventKey: notificationEventKey("MESSAGE_RECEIVED", conversationId, message.id),
    relatedEntityType: "CONVERSATION",
    relatedEntityId: conversationId,
  });

  return c.json(ok({ conversationId, messageId: message.id }), 201);
});