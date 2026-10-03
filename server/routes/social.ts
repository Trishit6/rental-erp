import { Router } from "../lib/http";
import { z } from "zod";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationParticipants,
  conversations,
  messages,
  notifications,
  products,
  users,
} from "../schema";
import { ok, HttpError } from "../lib/api";
import { requireUser } from "../lib/auth";

export const messagesRoute = new Router();
export const notificationsRoute = new Router();
export const usersRoute = new Router();

/* --------------------------------- messages -------------------------------- */

messagesRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

messagesRoute.get("/conversations", async (c) => {
  const user = c.get("user")!;

  const rows = await db
    .select({
      conversationId: conversations.id,
      productId: conversations.productId,
      lastMessageAt: conversations.lastMessageAt,
      productTitle: products.title,
      productSlug: products.slug,
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
    .where(eq(conversationParticipants.userId, user.id))
    .orderBy(desc(conversations.lastMessageAt));

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const [other] = await db
        .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
        .from(conversationParticipants)
        .innerJoin(users, eq(conversationParticipants.userId, users.id))
        .where(
          and(
            eq(conversationParticipants.conversationId, row.conversationId),
            ne(conversationParticipants.userId, user.id),
          ),
        )
        .limit(1);
      return {
        ...row,
        unread: Number(row.unread),
        otherUser: other ?? null,
      };
    }),
  );

  return c.json(ok(enriched));
});

const startConversationSchema = z.object({
  sellerId: z.number().int().positive(),
  productId: z.number().int().positive().optional(),
  body: z.string().trim().min(1).max(2000),
});

messagesRoute.post("/conversations", async (c) => {
  const user = c.get("user")!;
  const input = startConversationSchema.parse(await c.req.json());
  if (input.sellerId === user.id) {
    throw new HttpError(400, "BAD_REQUEST", "You cannot message yourself.");
  }

  // Reuse existing conversation between these users for the same product
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      eq(conversations.id, conversationParticipants.conversationId),
    )
    .where(
      and(
        input.productId
          ? eq(conversations.productId, input.productId)
          : sql`${conversations.productId} IS NULL`,
        inArray(
          conversations.id,
          db
            .select({ id: conversationParticipants.conversationId })
            .from(conversationParticipants)
            .where(eq(conversationParticipants.userId, user.id)),
        ),
      ),
    )
    .limit(1);

  let conversationId: number;
  if (existing.length) {
    conversationId = existing[0].id;
  } else {
    const [created] = await db
      .insert(conversations)
      .values({
        productId: input.productId ?? null,
      })
      .$returningId();
    conversationId = Number(created.id);
    await db.insert(conversationParticipants).values([
      { conversationId, userId: user.id },
      { conversationId, userId: input.sellerId },
    ]);
  }

  await db.insert(messages).values({
    conversationId,
    senderId: user.id,
    body: input.body,
  });
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));
  await db.insert(notifications).values({
    userId: input.sellerId,
    type: "MESSAGE_RECEIVED",
    title: "New message",
    body: `${user.name} sent you a message.`,
    link: "/dashboard/messages",
  });

  return c.json(ok({ conversationId }), 201);
});

function assertParticipant(userId: number, row: { userId: number } | undefined) {
  if (!row || row.userId !== userId) {
    throw new HttpError(403, "FORBIDDEN", "You are not part of this conversation.");
  }
}

messagesRoute.get("/conversations/:id/messages", async (c) => {
  const user = c.get("user")!;
  const conversationId = Number(c.req.param("id"));

  const [participant] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, user.id),
      ),
    )
    .limit(1);
  assertParticipant(user.id, participant);

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      body: messages.body,
      createdAt: messages.createdAt,
      senderName: users.name,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, user.id),
      ),
    );

  return c.json(ok(rows));
});

messagesRoute.post("/conversations/:id/messages", async (c) => {
  const user = c.get("user")!;
  const conversationId = Number(c.req.param("id"));
  const input = z.object({ body: z.string().trim().min(1).max(2000) }).parse(await c.req.json());

  const [participant] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, user.id),
      ),
    )
    .limit(1);
  assertParticipant(user.id, participant);

  await db.insert(messages).values({
    conversationId,
    senderId: user.id,
    body: input.body,
  });
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const [other] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, user.id),
      ),
    )
    .limit(1);
  if (other) {
    await db.insert(notifications).values({
      userId: other.userId,
      type: "MESSAGE_RECEIVED",
      title: "New message",
      body: `${user.name} sent you a message.`,
      link: "/dashboard/messages",
    });
  }

  return c.json(ok({ sent: true }), 201);
});

/* ------------------------------- notifications ------------------------------ */

notificationsRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

notificationsRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  const unread = rows.filter((r) => !r.readAt).length;
  return c.json(ok({ items: rows, unread }));
});

notificationsRoute.patch("/:id/read", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
  return c.json(ok({ read: true }));
});

notificationsRoute.post("/read-all", async (c) => {
  const user = c.get("user")!;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), sql`${notifications.readAt} IS NULL`));
  return c.json(ok({ read: true }));
});

/* ---------------------------------- users ---------------------------------- */

usersRoute.get("/me", (c) => {
  const user = requireUser(c);
  return c.json(ok(user));
});

usersRoute.patch("/me", async (c) => {
  const user = requireUser(c);
  const input = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      phone: z.string().trim().max(20).optional(),
      avatarUrl: z.string().url().max(500).optional(),
    })
    .parse(await c.req.json());
  await db.update(users).set(input).where(eq(users.id, user.id));
  const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return c.json(
    ok({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      verified: updated.verified,
      avatarUrl: updated.avatarUrl,
      phone: updated.phone,
    }),
  );
});
