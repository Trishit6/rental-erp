import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  conversationParticipants,
  conversations,
  messages,
  notifications,
  orderItems,
  orders,
  products,
  rentals,
  reviews,
  users,
} from "../schema";
import { ok, HttpError } from "../lib/api";
import { requireUser } from "../lib/auth";

export const reviewsRoute = new Hono();
export const messagesRoute = new Hono();
export const notificationsRoute = new Hono();
export const usersRoute = new Hono();

/* --------------------------------- reviews --------------------------------- */

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(5).max(2000),
  orderId: z.number().int().positive().optional(),
  rentalId: z.number().int().positive().optional(),
});

const REVIEWABLE_ORDER_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"];

reviewsRoute.get("/product/:id", async (c) => {
  const productId = Number(c.req.param("id"));
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      userName: users.name,
      userAvatar: users.avatarUrl,
    })
    .from(reviews)
    .innerJoin(users, eq(reviews.userId, users.id))
    .where(eq(reviews.productId, productId))
    .orderBy(desc(reviews.createdAt));
  return c.json(ok(rows));
});

reviewsRoute.post("/product/:id", async (c) => {
  const user = requireUser(c);
  const productId = Number(c.req.param("id"));
  const input = reviewSchema.parse(await c.req.json());

  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found.");

  const [purchased] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orderItems.productId, productId),
        eq(orders.userId, user.id),
        inArray(orders.status, REVIEWABLE_ORDER_STATUSES),
      ),
    )
    .limit(1);

  const [rented] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.productId, productId), eq(rentals.renterId, user.id)))
    .limit(1);

  if (!purchased && !rented) {
    throw new HttpError(
      403,
      "REVIEW_NOT_ALLOWED",
      "Only buyers or renters can review this product.",
    );
  }

  try {
    const [created] = await db.insert(reviews).values({
      userId: user.id,
      productId,
      sellerId: product.sellerId,
      orderId: input.orderId ?? null,
      rentalId: input.rentalId ?? null,
      rating: input.rating,
      title: input.title ?? null,
      comment: input.comment,
    });

    // Update product rating aggregate
    const [agg] = await db
      .select({
        avg: sql<number>`AVG(${reviews.rating})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(reviews)
      .where(eq(reviews.productId, productId));
    await db
      .update(products)
      .set({
        ratingAverage: Math.round(Number(agg.avg) * 10) / 10,
        ratingCount: Number(agg.count),
      })
      .where(eq(products.id, productId));

    await db.insert(notifications).values({
      userId: product.sellerId,
      type: "REVIEW_RECEIVED",
      title: "New review received",
      body: `${user.name} left a ${input.rating}-star review.`,
      link: `/product/${product.slug}`,
    });

    return c.json(ok(created), 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Duplicate entry")) {
      throw new HttpError(409, "DUPLICATE_REVIEW", "You have already reviewed this purchase.");
    }
    throw error;
  }
});

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
