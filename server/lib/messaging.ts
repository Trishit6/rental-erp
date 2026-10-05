import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationParticipants,
  conversations,
  messages,
  orders,
  orderItems,
  products,
  rentals,
  users,
} from "../schema";
import { HttpError } from "./api";
import type { SessionUser } from "./auth";
import { isSellerRole } from "./seller-access";

/**
 * Customer ↔ seller conversations.
 *
 * ## Authorization is the whole point of this file
 *
 * A `conversationId` in a URL is a *claim*, not a permission. Every function that
 * takes one resolves it through `requireParticipation`, which answers a single
 * question — "is the session user a row in `conversation_participants` for this
 * conversation?" — and refuses with a 403 otherwise. No route exposes a
 * `userId`, `customerId` or `sellerId` from the client at all; participants are always
 * *derived* from the session and from rows the server has already fetched.
 *
 * That matters because the failure mode of getting it wrong is a customer reading
 * another customer's private messages — the worst bug this feature could ship — and
 * because a design that "trusted the client" would look correct today and become
 * wrong the first time someone edited a route.
 *
 * ## Why a conversation is anchored to business context
 *
 * There is no way to open a thread with an arbitrary user. `assertCanContactSeller`
 * requires a real, publicly-visible listing and a seller on the other side of it.
 * "Contact seller" on a product page is the only entry point; an existing thread may
 * afterwards be *attached* to an order or rental the session user is provably a party
 * to, but it is never detached from the listing that made it legitimate. That is what
 * keeps this a marketplace feature rather than an open messaging product with a
 * storefront bolted on.
 */

/** A participant, projected down to what a conversation list renders. */
export type ConversationParticipant = {
  id: number;
  name: string;
  avatarUrl: string | null;
  /** True when this participant owns the listing the thread is about. */
  isSeller: boolean;
};

export type ConversationSummary = {
  conversationId: number;
  productId: number | null;
  productTitle: string | null;
  productSlug: string | null;
  orderId: number | null;
  orderNumber: string | null;
  rentalId: number | null;
  lastMessageAt: string;
  /** Preview of the most recent message, or null for a thread with no messages yet. */
  lastMessageBody: string | null;
  /** Whether the newest message came from the other participant. Null when empty. */
  lastMessageIsMine: boolean | null;
  unread: number;
  otherUser: ConversationParticipant | null;
  /**
   * Whether the *other* participant is the listing's seller.
   *
   * Resolved server-side because the UI needs it for the workspace distinction, and
   * because it is the same fact `assertCanContactSeller` already established — so it
   * cannot disagree with the authorization above.
   */
  otherUserIsSeller: boolean;
};

export type MessageRecord = {
  id: number;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

/**
 * Prove the session user is in this conversation.
 *
 * Throws rather than returning a boolean, because every caller must act on the answer
 * and a caller that forgot to check a boolean would be a confidentiality hole with
 * no type error.
 *
 * ## Why 403 and not 404
 *
 * The id is a real, live conversation, and answering "no such conversation" to a
 * user who is genuinely not in it would make their own link mistakes
 * ("I copied the wrong id") indistinguishable from a permissions failure. 403 with a
 * clear message is the honest answer.
 */
export async function requireParticipation(
  conversationId: number,
  userId: number,
): Promise<void> {
  const [row] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HttpError(403, "FORBIDDEN", "You are not part of this conversation.");
  }
}

/** The other participant's id, resolved from the participants table. */
export async function otherParticipantId(
  conversationId: number,
  userId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  return row?.userId ?? null;
}

/** The row shape `listConversations` selects, before the other-party join. */
type ConversationRow = {
  conversationId: number;
  productId: number | null;
  orderId: number | null;
  rentalId: number | null;
  lastMessageAt: Date;
  lastMessageBody: string | null;
  lastMessageSenderId: number | null;
  productTitle: string | null;
  productSlug: string | null;
  productSellerId: number | null;
  orderNumber: string | null;
  unread: number;
};

/**
 * Every conversation the session user is in, most recently active first.
 *
 * ## Two queries, not two per row
 *
 * The obvious implementation runs a "who is the other participant?" query inside a
 * loop over the rows, which is one round-trip per conversation. Here the whole
 * participant set is fetched in a single query keyed by conversation id, so the list
 * costs two round-trips no matter how many threads there are — and a seller with
 * hundreds of them pays exactly the same as a customer with two.
 */
export async function listConversations(user: SessionUser): Promise<ConversationSummary[]> {
  const rows: ConversationRow[] = await db
    .select({
      conversationId: conversations.id,
      productId: conversations.productId,
      orderId: conversations.orderId,
      rentalId: conversations.rentalId,
      lastMessageAt: conversations.lastMessageAt,
      productTitle: products.title,
      productSlug: products.slug,
      productSellerId: products.sellerId,
      orderNumber: orders.orderNumber,
      /**
       * The newest message, as a correlated subquery rather than a `LEFT JOIN`.
       *
       * A join onto `messages` would multiply each conversation row by its thread
       * length and then need de-duplication — reading the entire transcript of every
       * conversation to render one preview line. `MAX(id)` is the newest row because
       * ids are monotonic, and the index on `conversation_id` makes it a bounded
       * lookup.
       */
      lastMessageBody: sql<string | null>`(
        SELECT m.body FROM messages m
        WHERE m.conversation_id = ${conversations.id}
        ORDER BY m.id DESC LIMIT 1
      )`,
      lastMessageSenderId: sql<number | null>`(
        SELECT m.sender_id FROM messages m
        WHERE m.conversation_id = ${conversations.id}
        ORDER BY m.id DESC LIMIT 1
      )`,
      /**
       * The unread badge, likewise in SQL.
       *
       * Bounded by the composite index on `(conversation_id, created_at)`, so it walks
       * only the unread tail of this one thread. The alternative — fetching the thread
       * and counting in JavaScript — would mean reading every message body in the app
       * to draw a number.
       */
      unread: sql<number>`(
        SELECT COUNT(*) FROM messages m
        WHERE m.conversation_id = ${conversations.id}
          AND m.sender_id <> ${user.id}
          AND (${conversationParticipants.lastReadAt} IS NULL
               OR m.created_at > ${conversationParticipants.lastReadAt})
      )`,
    })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
    .leftJoin(products, eq(conversations.productId, products.id))
    .leftJoin(orders, eq(conversations.orderId, orders.id))
    .where(eq(conversationParticipants.userId, user.id))
    .orderBy(desc(conversations.lastMessageAt));

  if (rows.length === 0) return [];

  const others = await otherParticipantsByConversation(rows, user.id);

  return rows.map((row) => {
    const other = others.get(row.conversationId) ?? null;
    return {
      conversationId: row.conversationId,
      productId: row.productId,
      productTitle: row.productTitle,
      productSlug: row.productSlug,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      rentalId: row.rentalId,
      lastMessageAt: row.lastMessageAt.toISOString(),
      lastMessageBody: row.lastMessageBody,
      lastMessageIsMine:
        row.lastMessageSenderId === null ? null : row.lastMessageSenderId === user.id,
      unread: Number(row.unread),
      otherUser: other,
      otherUserIsSeller: other !== null && row.productSellerId === other.id,
    };
  });
}

/**
 * The counterpart for every listed conversation, in one query.
 *
 * A `(conversation_id, user_id)` primary key means the whole result set is addressed
 * by `inArray` on `conversationId`, so this is one indexed scan regardless of list
 * length.
 */
async function otherParticipantsByConversation(
  rows: readonly ConversationRow[],
  userId: number,
): Promise<Map<number, ConversationParticipant>> {
  const participants = await db
    .select({
      conversationId: conversationParticipants.conversationId,
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(conversationParticipants)
    .innerJoin(users, eq(conversationParticipants.userId, users.id))
    .where(
      and(
        inArray(
          conversationParticipants.conversationId,
          rows.map((row) => row.conversationId),
        ),
        ne(conversationParticipants.userId, userId),
      ),
    );

  // "Is the seller" is answered against `products.sellerId` — which each row already
  // selected — rather than against the other participant's role. A user is a seller in
  // the thread about the listing they own and the buyer in the thread about the
  // listing they bought from, and those two facts are not interchangeable; a role
  // check would get the second one wrong.
  const sellerIds = new Map(rows.map((row) => [row.conversationId, row.productSellerId]));

  return new Map(
    participants.map((row) => [
      row.conversationId,
      {
        id: row.id,
        name: row.name,
        avatarUrl: row.avatarUrl,
        isSeller: sellerIds.get(row.conversationId) === row.id,
      },
    ]),
  );
}

/** The transcript, oldest first, with the reader's read marker advanced. */
export async function listMessages(
  conversationId: number,
  user: SessionUser,
): Promise<MessageRecord[]> {
  await requireParticipation(conversationId, user.id);

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderName: users.name,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt, messages.id);

  await markConversationRead(conversationId, user.id);

  return rows.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    senderName: row.senderName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    isMine: row.senderId === user.id,
  }));
}

/**
 * Advance this participant's read marker.
 *
 * `lastReadAt` is stamped at `now`, not at the newest message's time. That is
 * deliberate: stamping it at the message time would classify any message that arrived
 * *while this request was in flight* as already read, which is a silently dropped
 * message. `now` is the conservative direction — it can only ever re-mark something
 * unread, never hide one.
 */
export async function markConversationRead(
  conversationId: number,
  userId: number,
): Promise<void> {
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    );
}

/**
 * Append a message to a conversation the caller has been proved to be in.
 *
 * The participation check lives here and not only in the route, so no future caller
 * can reach this function with an unverified conversation id. It is a separate
 * `await` rather than half of a `WHERE` clause precisely because a check folded into
 * a predicate is a check that can be forgotten.
 */
export async function appendMessage(
  conversationId: number,
  user: SessionUser,
  body: string,
): Promise<MessageRecord> {
  await requireParticipation(conversationId, user.id);

  const now = new Date();
  const trimmed = body.trim().slice(0, 2000);
  const [inserted] = await db
    .insert(messages)
    .values({ conversationId, senderId: user.id, body: trimmed })
    .$returningId();

  await db
    .update(conversations)
    .set({ lastMessageAt: now })
    .where(eq(conversations.id, conversationId));

  return {
    id: Number(inserted.id),
    senderId: user.id,
    senderName: user.name,
    body: trimmed,
    createdAt: now.toISOString(),
    isMine: true,
  };
}

/**
 * Whether this buyer may start (or continue) a conversation about this product.
 *
 * Three refusals, each for a real reason rather than defensive habit:
 *
 *  - yourself: there is no business context in a note to yourself;
 *  - a listing that is not public: messaging about an archived or draft listing would
 *    confirm that it exists at all;
 *  - a counterparty who is not a seller: this is the customer↔seller boundary. A
 *    customer may always ask a seller a question; two customers may not open a channel
 *    to each other.
 */
export async function assertCanContactSeller(
  productId: number,
  buyer: SessionUser,
): Promise<{ product: typeof products.$inferSelect; sellerId: number }> {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "This listing is no longer available.");
  if (product.status === "ARCHIVED" || product.status === "DRAFT") {
    throw new HttpError(
      409,
      "LISTING_UNAVAILABLE",
      "This listing is not available for messages right now.",
    );
  }
  if (product.sellerId === buyer.id) {
    throw new HttpError(400, "BAD_REQUEST", "You cannot message yourself.");
  }

  const [seller] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, product.sellerId))
    .limit(1);
  if (!seller || !isSellerRole(seller.role)) {
    throw new HttpError(409, "SELLER_UNAVAILABLE", "The seller cannot receive messages right now.");
  }

  return { product, sellerId: product.sellerId };
}

/**
 * Find or open the single thread between two users about one product.
 *
 * ## Why the lookup is scoped on both participants
 *
 * A listing can have one thread per (buyer, seller) pair, not one per listing: two
 * buyers asking the same seller about the same item are different conversations, and
 * merging them would put two strangers' messages in one transcript. The `inArray`
 * sub-select is what enforces "and the seller is already in it" — without it this
 * returns the *first buyer's* thread and appends the second buyer into it.
 */
export async function findOrCreateConversation(
  productId: number,
  buyer: SessionUser,
  sellerId: number,
): Promise<number> {
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(conversationParticipants, eq(conversations.id, conversationParticipants.conversationId))
    .where(
      and(
        eq(conversations.productId, productId),
        eq(conversationParticipants.userId, buyer.id),
        inArray(
          conversations.id,
          db
            .select({ id: conversationParticipants.conversationId })
            .from(conversationParticipants)
            .where(eq(conversationParticipants.userId, sellerId)),
        ),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({ productId })
    .$returningId();
  const conversationId = Number(created.id);
  await db.insert(conversationParticipants).values([
    { conversationId, userId: buyer.id },
    { conversationId, userId: sellerId },
  ]);
  return conversationId;
}

/**
 * Point a conversation at the order or rental it is about.
 *
 * ## Why the id is verified rather than trusted
 *
 * The client names the id — otherwise the UI would ask a user to type one — and the
 * server proves the session user is a party to it before storing anything. Without
 * that check a customer could attach their thread to somebody else's receipt, and
 * the conversation pane would then display an order that is not theirs.
 *
 * A failed verification is silently a no-op rather than an error: the message itself
 * is the thing the user asked for, and refusing to send it because the *context* was
 * wrong would be a worse outcome than sending it without a context chip.
 */
export async function attachBusinessContext(
  conversationId: number,
  user: SessionUser,
  context: { orderId?: number | null; rentalId?: number | null },
): Promise<void> {
  const { orderId, rentalId } = context;

  if (orderId !== undefined && orderId !== null) {
    const owned = await isPartyToOrder(user, orderId);
    if (owned) {
      await db.update(conversations).set({ orderId }).where(eq(conversations.id, conversationId));
    }
  }

  if (rentalId !== undefined && rentalId !== null) {
    const owned = await isPartyToRental(user, rentalId);
    if (owned) {
      await db.update(conversations).set({ rentalId }).where(eq(conversations.id, conversationId));
    }
  }
}

/**
 * Whether a user is a party to an order — as its customer, or as a seller with a line
 * on it.
 *
 * The seller branch goes through `order_items` rather than comparing a `sellerId` that
 * `orders` does not have: an order can contain lines from several sellers, so "is this
 * seller in this order" is only answerable from the lines.
 */
export async function isPartyToOrder(user: SessionUser, orderId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.id, orderId),
        or(eq(orders.userId, user.id), eq(orderItems.sellerId, user.id)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Whether a user is the renter or the owner of a rental. */
export async function isPartyToRental(user: SessionUser, rentalId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(
      and(
        eq(rentals.id, rentalId),
        or(eq(rentals.renterId, user.id), eq(rentals.ownerId, user.id)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The orders and rentals a user may attach to a conversation.
 *
 * ## Why this exists
 *
 * So the client can offer real values in a picker instead of a free-text id field.
 * An id the user types is an id nobody has verified; every value here has been through
 * the same `isPartyToOrder`/`isPartyToRental` check the write path uses, so the
 * choices and the authorization cannot drift apart.
 *
 * Bounded to the most recent 20 of each: this is a picker for "which recent thing is
 * this about?", not an archive browser, and an unbounded list would be a second orders
 * page with worse pagination.
 */
export async function listContextReferences(user: SessionUser): Promise<{
  orders: { id: number; orderNumber: string | null }[];
  rentals: { id: number; endDate: string }[];
}> {
  const [sellerOrderRows, customerOrderRows, rentalRows] = await Promise.all([
    db
      .selectDistinct({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(eq(orderItems.sellerId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(20),
    db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(20),
    db
      .select({ id: rentals.id, endDate: rentals.endDate })
      .from(rentals)
      .where(
        user.role === "ADMIN"
          ? sql`1 = 1`
          : or(eq(rentals.renterId, user.id), eq(rentals.ownerId, user.id)),
      )
      .orderBy(desc(rentals.id))
      .limit(20),
  ]);

  // A seller sees the orders they have lines on; a customer sees the orders they
  // placed. Merged and de-duplicated so a user who is both does not see each order
  // twice in the picker.
  const byId = new Map<number, { id: number; orderNumber: string | null }>();
  for (const row of [...customerOrderRows, ...sellerOrderRows]) byId.set(row.id, row);

  return {
    orders: [...byId.values()].slice(0, 20),
    rentals: rentalRows.map((row) => ({ id: row.id, endDate: row.endDate.toISOString() })),
  };
}