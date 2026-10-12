import { z } from "zod";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  orderItems,
  orders,
  rentals,
  supportTickets,
  ticketAttachments,
  ticketMessages,
  users,
} from "../schema";
import { buildPagination, HttpError } from "./api";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";
import { objectKeyFromUrl, ownsObjectKey, scopeOfObjectKey } from "./storage/types";

/**
 * Support tickets, user side (PROMPT 19).
 *
 * ## The shape of the module
 *
 * The **pure** half — priority inference, help-topic suggestion, the reopen window,
 * the ticket-number format — takes no database and is exercised directly by tests.
 * The database half is written so that every read that answers a *customer* is scoped
 * by `userId` in the `where` clause rather than by a filter applied afterwards. A
 * ticket id is a row count; it is not a capability, and the only thing standing
 * between one customer and another's ticket is that `user_id` predicate.
 *
 * ## Why internal notes are a query concern, not a view concern
 *
 * `ticket_messages.is_internal` is filtered **in SQL** for the user-facing reads, so
 * a staff-only line is never serialised, never cached on the client and never visible
 * to a stray log. Hiding it with CSS after sending it would be a data leak with extra
 * steps.
 */

/* --------------------------------- vocabulary ------------------------------ */

export const TICKET_STATUSES = ["OPEN", "PENDING", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** A ticket a customer may still add to. Resolved/closed are read-only until reopened. */
export const CUSTOMER_REPLYABLE_STATUSES: readonly TicketStatus[] = [
  "OPEN",
  "PENDING",
  "IN_PROGRESS",
];

/** Statuses that count as "still being worked" for the duplicate-ticket warning. */
export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = ["OPEN", "PENDING", "IN_PROGRESS"];

export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** A ticket may be reopened for this long after it is resolved or closed. */
export const REOPEN_WINDOW_DAYS = 7;
export const REOPEN_WINDOW_MS = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export const TICKET_SUBJECT_MAX = 200;
export const TICKET_BODY_MAX = 4000;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

/* --------------------------------- priority -------------------------------- */

/**
 * Keywords that escalate a ticket on receipt.
 *
 * A pipeline where a "my card was charged twice" ticket waits behind a queue is a
 * pipeline that fails the case it most needs to catch, so the guess is made once, at
 * creation, from words the customer actually used. Staff can still re-prioritise.
 */
const URGENT_KEYWORDS = [
  "fraud",
  "unauthorized",
  "unauthorised",
  "hacked",
  "stolen",
  "double charged",
  "charged twice",
];
const HIGH_KEYWORDS = [
  "payment",
  "refund",
  "deposit",
  "charge",
  "charged",
  "money",
  "invoice",
  "billing",
];

export function autoPriority(subject: string, body = ""): TicketPriority {
  const text = `${subject} ${body}`.toLowerCase();
  if (URGENT_KEYWORDS.some((word) => text.includes(word))) return "URGENT";
  if (HIGH_KEYWORDS.some((word) => text.includes(word))) return "HIGH";
  return "NORMAL";
}

/* ------------------------------- help topics ------------------------------- */

/**
 * Suggested help topics, surfaced as the customer types a subject.
 *
 * A short, curated list rather than a search index: the goal is to answer the common
 * questions before a ticket exists, and a curated set is one someone can keep correct.
 */
export const HELP_TOPICS = [
  {
    id: "payment-failed",
    title: "A payment failed or was declined",
    keywords: ["payment", "declined", "card", "failed", "charged", "checkout"],
  },
  {
    id: "refund-status",
    title: "Where is my refund?",
    keywords: ["refund", "money back", "reimburse", "cancelled"],
  },
  {
    id: "deposit-return",
    title: "My rental deposit has not been returned",
    keywords: ["deposit", "security", "return", "deduction"],
  },
  {
    id: "order-not-arrived",
    title: "My order has not arrived",
    keywords: ["delivery", "shipping", "arrived", "late", "tracking", "courier"],
  },
  {
    id: "return-rental",
    title: "How do I return a rental?",
    keywords: ["return", "rental", "give back", "drop off"],
  },
  {
    id: "damaged-item",
    title: "My item arrived damaged or faulty",
    keywords: ["damaged", "broken", "faulty", "not working", "defective"],
  },
  {
    id: "sell-on-revaro",
    title: "How do I start selling?",
    keywords: ["sell", "seller", "listing", "become", "store"],
  },
  {
    id: "account-security",
    title: "I think my account was accessed",
    keywords: ["account", "hacked", "unauthorized", "security", "password", "lock"],
  },
] as const;

export type HelpTopic = { id: string; title: string };

export function suggestHelpTopics(query: string, limit = 5): HelpTopic[] {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1);
  if (words.length === 0) return [];

  return HELP_TOPICS.map((topic) => {
    const haystack = `${topic.title} ${topic.keywords.join(" ")}`.toLowerCase();
    const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
    return { topic, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title))
    .slice(0, limit)
    .map((entry) => ({ id: entry.topic.id, title: entry.topic.title }));
}

/* ------------------------------ ticket numbers ----------------------------- */

/** `TK-2026-000123` — the format the spec asks for, derived from the row id. */
export function ticketNumberFor(id: number, now: Date = new Date()): string {
  return `TK-${now.getFullYear()}-${String(id).padStart(6, "0")}`;
}

/* ------------------------------ reopen window ------------------------------ */

export function isReopenable(
  ticket: { status: string; resolvedAt: Date | string | null; closedAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") return false;
  const anchor = ticket.closedAt ?? ticket.resolvedAt;
  if (!anchor) return false;
  const resolved = anchor instanceof Date ? anchor.getTime() : new Date(anchor).getTime();
  if (Number.isNaN(resolved)) return false;
  return now.getTime() - resolved <= REOPEN_WINDOW_MS;
}

/* ---------------------------------- input ---------------------------------- */

const positiveId = z.number().int().positive();

export const attachmentInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    url: z.string().trim().min(1).max(500),
    mimeType: z.string().trim().max(120).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .strict();

export type AttachmentInput = z.infer<typeof attachmentInputSchema>;

export const createTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(TICKET_SUBJECT_MAX),
    body: z.string().trim().min(1).max(TICKET_BODY_MAX),
    orderId: positiveId.optional(),
    rentalId: positiveId.optional(),
    attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  })
  .strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const ticketMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(TICKET_BODY_MAX),
    attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).optional(),
  })
  .strict();

export type TicketMessageInput = z.infer<typeof ticketMessageSchema>;

export const ticketRatingSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
  })
  .strict();

export type TicketRatingInput = z.infer<typeof ticketRatingSchema>;

/* -------------------------------- payloads --------------------------------- */

export type TicketAttachment = {
  id: number;
  fileName: string;
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type TicketMessageRecord = {
  id: number;
  body: string;
  createdAt: Date;
  authorId: number;
  authorName: string;
  authorIsStaff: boolean;
  attachments: TicketAttachment[];
};

export type TicketSummary = {
  id: number;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  orderId: number | null;
  rentalId: number | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  resolutionRating: number | null;
  messageCount: number;
};

export type TicketDetail = TicketSummary & {
  /** Never contains an internal staff note — filtered in SQL. */
  messages: TicketMessageRecord[];
};

/* ------------------------------ executor types ----------------------------- */

type SupportExecutor = Pick<typeof db, "insert" | "select" | "update">;

/* -------------------------------- ownership -------------------------------- */

/**
 * Resolve the ticket, scoped to its owner.
 *
 * The `user_id` predicate is in the `where` clause on purpose: a caller who guesses a
 * ticket id gets the same `404` as a caller who guessed one that never existed, so the
 * endpoint cannot be used to enumerate other people's tickets.
 */
async function requireOwnTicket(userId: number, ticketId: number) {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)))
    .limit(1);
  if (!ticket) throw new HttpError(404, "NOT_FOUND", "That ticket does not exist.");
  return ticket;
}

/**
 * Prove an attachment URL is an object the caller uploaded under the `tickets` scope.
 *
 * Without this, "attach a file" would be "attach any URL", which is a way to make the
 * support thread render remote content the platform does not control.
 */
function assertOwnedAttachments(userId: number, attachments: readonly AttachmentInput[]): void {
  for (const attachment of attachments) {
    const key = objectKeyFromUrl(attachment.url);
    if (!key || scopeOfObjectKey(key) !== "tickets" || !ownsObjectKey(key, "tickets", userId)) {
      throw new HttpError(400, "BAD_ATTACHMENT", "That attachment is not one of your uploads.");
    }
  }
}

async function assertTicketTargets(
  userId: number,
  input: Pick<CreateTicketInput, "orderId" | "rentalId">,
): Promise<void> {
  if (input.orderId !== undefined) {
    const [order] = await db
      .select({ id: orders.id, userId: orders.userId })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    if (!order) throw new HttpError(404, "NOT_FOUND", "That order does not exist.");
    if (order.userId !== userId) {
      // The buyer owns the order; a seller may raise a ticket about one of their lines.
      const [line] = await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(and(eq(orderItems.orderId, input.orderId), eq(orderItems.sellerId, userId)))
        .limit(1);
      if (!line) throw new HttpError(404, "NOT_FOUND", "That order does not exist.");
    }
  }

  if (input.rentalId !== undefined) {
    const [rental] = await db
      .select({ id: rentals.id, renterId: rentals.renterId, ownerId: rentals.ownerId })
      .from(rentals)
      .where(eq(rentals.id, input.rentalId))
      .limit(1);
    if (!rental) throw new HttpError(404, "NOT_FOUND", "That rental does not exist.");
    if (rental.renterId !== userId && rental.ownerId !== userId) {
      throw new HttpError(404, "NOT_FOUND", "That rental does not exist.");
    }
  }
}

/* ---------------------------------- writes --------------------------------- */

async function insertMessage(
  executor: SupportExecutor,
  input: {
    ticketId: number;
    authorId: number;
    body: string;
    isInternal: boolean;
    attachments: readonly AttachmentInput[];
  },
): Promise<number> {
  const [created] = await executor
    .insert(ticketMessages)
    .values({
      ticketId: input.ticketId,
      authorId: input.authorId,
      body: input.body,
      isInternal: input.isInternal,
    })
    .$returningId();
  const messageId = Number(created.id);

  if (input.attachments.length > 0) {
    await executor.insert(ticketAttachments).values(
      input.attachments.map((attachment) => ({
        ticketMessageId: messageId,
        fileName: attachment.fileName,
        url: attachment.url,
        mimeType: attachment.mimeType ?? null,
        sizeBytes: attachment.sizeBytes ?? null,
      })),
    );
  }

  return messageId;
}

export async function createTicket(
  userId: number,
  input: CreateTicketInput,
): Promise<{ id: number; ticketNumber: string }> {
  await assertTicketTargets(userId, input);
  const attachments = input.attachments ?? [];
  assertOwnedAttachments(userId, attachments);
  const priority = autoPriority(input.subject, input.body);

  return db.transaction(async (tx) => {
    // The number is derived from the id, so the row is inserted under a unique
    // placeholder and the real number written back once the id exists.
    const [created] = await tx
      .insert(supportTickets)
      .values({
        ticketNumber: `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        userId,
        orderId: input.orderId ?? null,
        rentalId: input.rentalId ?? null,
        subject: input.subject,
        priority,
        status: "OPEN",
      })
      .$returningId();
    const id = Number(created.id);
    const ticketNumber = ticketNumberFor(id);
    await tx.update(supportTickets).set({ ticketNumber }).where(eq(supportTickets.id, id));
    await insertMessage(tx, {
      ticketId: id,
      authorId: userId,
      body: input.body,
      isInternal: false,
      attachments,
    });

    return { id, ticketNumber };
  });
}

export async function appendTicketMessage(
  userId: number,
  ticketId: number,
  input: TicketMessageInput,
): Promise<{ messageId: number; status: TicketStatus }> {
  const ticket = await requireOwnTicket(userId, ticketId);
  if (!CUSTOMER_REPLYABLE_STATUSES.includes(ticket.status as TicketStatus)) {
    throw new HttpError(
      409,
      "TICKET_NOT_OPEN",
      "This ticket is resolved. Reopen it to continue the conversation.",
    );
  }

  const attachments = input.attachments ?? [];
  assertOwnedAttachments(userId, attachments);
  // A customer replying to "we need more from you" (PENDING) hands the ticket back —
  // it returns to the open queue rather than sitting in a state that reads as ours.
  const nextStatus: TicketStatus =
    ticket.status === "PENDING" ? "OPEN" : (ticket.status as TicketStatus);

  const messageId = await db.transaction(async (tx) => {
    const id = await insertMessage(tx, {
      ticketId,
      authorId: userId,
      body: input.body,
      isInternal: false,
      attachments,
    });
    if (nextStatus !== ticket.status) {
      await tx
        .update(supportTickets)
        .set({ status: nextStatus })
        .where(eq(supportTickets.id, ticketId));
    }
    return id;
  });

  return { messageId, status: nextStatus };
}

export async function reopenTicket(
  userId: number,
  ticketId: number,
): Promise<{ id: number; status: "OPEN" }> {
  const ticket = await requireOwnTicket(userId, ticketId);
  if (!isReopenable(ticket)) {
    throw new HttpError(
      409,
      "NOT_REOPENABLE",
      `A ticket can only be reopened within ${REOPEN_WINDOW_DAYS} days of being resolved.`,
    );
  }

  await db
    .update(supportTickets)
    .set({ status: "OPEN", resolvedAt: null, closedAt: null })
    .where(eq(supportTickets.id, ticketId));

  return { id: ticketId, status: "OPEN" };
}

export async function rateTicket(
  userId: number,
  ticketId: number,
  input: TicketRatingInput,
): Promise<{ id: number; rating: number }> {
  const ticket = await requireOwnTicket(userId, ticketId);
  if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
    throw new HttpError(409, "TICKET_NOT_RESOLVED", "You can rate a ticket once it is resolved.");
  }

  await db
    .update(supportTickets)
    .set({ resolutionRating: input.rating, resolutionComment: input.comment ?? null })
    .where(eq(supportTickets.id, ticketId));

  return { id: ticketId, rating: input.rating };
}

/* ---------------------------------- reads ---------------------------------- */

/** The customer's message count, as a correlated subquery so the list stays one query. */
const messageCountSql = sql<number>`(
  SELECT COUNT(*) FROM ticket_messages
  WHERE ticket_messages.ticket_id = ${supportTickets.id}
    AND ticket_messages.is_internal = 0
)`;

function summaryColumns() {
  return {
    id: supportTickets.id,
    ticketNumber: supportTickets.ticketNumber,
    subject: supportTickets.subject,
    status: supportTickets.status,
    priority: supportTickets.priority,
    orderId: supportTickets.orderId,
    rentalId: supportTickets.rentalId,
    createdAt: supportTickets.createdAt,
    updatedAt: supportTickets.updatedAt,
    resolvedAt: supportTickets.resolvedAt,
    closedAt: supportTickets.closedAt,
    resolutionRating: supportTickets.resolutionRating,
    messageCount: messageCountSql,
  };
}

export async function listTickets(
  userId: number,
  options: { page: number; pageSize: number; status?: TicketStatus },
): Promise<{ rows: TicketSummary[]; pagination: ReturnType<typeof buildPagination> }> {
  const where = options.status
    ? and(eq(supportTickets.userId, userId), eq(supportTickets.status, options.status))
    : eq(supportTickets.userId, userId);

  const [{ total }] = await db.select({ total: count() }).from(supportTickets).where(where);

  const rows = await db
    .select(summaryColumns())
    .from(supportTickets)
    .where(where)
    .orderBy(desc(supportTickets.updatedAt))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize);

  return {
    rows: rows.map((row) => ({ ...row, messageCount: Number(row.messageCount) })),
    pagination: buildPagination(options.page, options.pageSize, Number(total)),
  };
}

async function loadMessages(
  executor: SupportExecutor,
  ticketId: number,
  includeInternal: boolean,
): Promise<TicketMessageRecord[]> {
  const messages = await executor
    .select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      createdAt: ticketMessages.createdAt,
      authorId: ticketMessages.authorId,
      authorName: users.name,
      authorRole: users.role,
    })
    .from(ticketMessages)
    .innerJoin(users, eq(users.id, ticketMessages.authorId))
    .where(
      includeInternal
        ? eq(ticketMessages.ticketId, ticketId)
        : and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.isInternal, false)),
    )
    .orderBy(ticketMessages.createdAt);

  if (messages.length === 0) return [];

  const attachments = await executor
    .select({
      id: ticketAttachments.id,
      ticketMessageId: ticketAttachments.ticketMessageId,
      fileName: ticketAttachments.fileName,
      url: ticketAttachments.url,
      mimeType: ticketAttachments.mimeType,
      sizeBytes: ticketAttachments.sizeBytes,
    })
    .from(ticketAttachments)
    .where(
      inArray(
        ticketAttachments.ticketMessageId,
        messages.map((message) => message.id),
      ),
    );

  const byMessage = new Map<number, TicketAttachment[]>();
  for (const attachment of attachments) {
    const list = byMessage.get(attachment.ticketMessageId) ?? [];
    list.push({
      id: attachment.id,
      fileName: attachment.fileName,
      url: attachment.url,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    });
    byMessage.set(attachment.ticketMessageId, list);
  }

  return messages.map((message) => ({
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    authorId: message.authorId,
    authorName: message.authorName,
    authorIsStaff: message.authorRole === "ADMIN" || message.authorRole === "SUPPORT",
    attachments: byMessage.get(message.id) ?? [],
  }));
}

export async function getCustomerTicket(userId: number, ticketId: number): Promise<TicketDetail> {
  const ticket = await requireOwnTicket(userId, ticketId);
  const messages = await loadMessages(db, ticketId, false);
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    orderId: ticket.orderId,
    rentalId: ticket.rentalId,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    resolutionRating: ticket.resolutionRating,
    messageCount: messages.length,
    messages,
  };
}

/**
 * An existing open ticket about the same order, for the "you already have a ticket
 * about this" warning. Returns `null` when there is nothing to warn about — the
 * warning is advisory, so a lookup that finds nothing is not an error.
 */
export async function findOpenTicketForOrder(
  userId: number,
  orderId: number,
): Promise<{ id: number; ticketNumber: string; subject: string; status: string } | null> {
  const [row] = await db
    .select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      subject: supportTickets.subject,
      status: supportTickets.status,
    })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.userId, userId),
        eq(supportTickets.orderId, orderId),
        inArray(supportTickets.status, [...OPEN_TICKET_STATUSES]),
      ),
    )
    .orderBy(desc(supportTickets.createdAt))
    .limit(1);

  return row ?? null;
}

/* ------------------------------- staff side -------------------------------- */

export type StaffTicketSummary = TicketSummary & {
  userId: number;
  requesterName: string;
  assigneeId: number | null;
};

export async function listTicketsForStaff(options: {
  page: number;
  pageSize: number;
  status?: TicketStatus;
}): Promise<{ rows: StaffTicketSummary[]; pagination: ReturnType<typeof buildPagination> }> {
  const where = options.status ? eq(supportTickets.status, options.status) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(supportTickets).where(where);

  const rows = await db
    .select({
      ...summaryColumns(),
      userId: supportTickets.userId,
      requesterName: users.name,
      assigneeId: supportTickets.assigneeId,
    })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .where(where)
    .orderBy(desc(supportTickets.updatedAt))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize);

  return {
    rows: rows.map((row) => ({ ...row, messageCount: Number(row.messageCount) })),
    pagination: buildPagination(options.page, options.pageSize, Number(total)),
  };
}

export async function getStaffTicket(ticketId: number): Promise<TicketDetail & { userId: number }> {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket) throw new HttpError(404, "NOT_FOUND", "That ticket does not exist.");

  const messages = await loadMessages(db, ticketId, true);
  return {
    id: ticket.id,
    userId: ticket.userId,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    orderId: ticket.orderId,
    rentalId: ticket.rentalId,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    resolutionRating: ticket.resolutionRating,
    messageCount: messages.length,
    messages,
  };
}

/**
 * A staff reply or internal note.
 *
 * A **non-internal** reply is the one support action that must reach the requester, so
 * it notifies them, keyed on the message id so a retried request notifies once. An
 * internal note writes a row the customer's reads filter out and notifies nobody.
 * Either way the ticket is assigned to whoever replied, if it was unassigned.
 */
export async function addStaffMessage(
  staffId: number,
  ticketId: number,
  input: { body: string; isInternal: boolean },
): Promise<{ messageId: number; status: TicketStatus }> {
  const [ticket] = await db
    .select({
      id: supportTickets.id,
      userId: supportTickets.userId,
      status: supportTickets.status,
      assigneeId: supportTickets.assigneeId,
    })
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket) throw new HttpError(404, "NOT_FOUND", "That ticket does not exist.");

  // A customer-side reply (OPEN) becomes PENDING once we answer: the ball is theirs.
  // An internal note changes nothing the customer can see.
  const nextStatus: TicketStatus = input.isInternal
    ? (ticket.status as TicketStatus)
    : ticket.status === "OPEN"
      ? "PENDING"
      : (ticket.status as TicketStatus);

  const messageId = await db.transaction(async (tx) => {
    const id = await insertMessage(tx, {
      ticketId,
      authorId: staffId,
      body: input.body,
      isInternal: input.isInternal,
      attachments: [],
    });
    await tx
      .update(supportTickets)
      .set({
        status: nextStatus,
        assigneeId: ticket.assigneeId ?? staffId,
      })
      .where(eq(supportTickets.id, ticketId));
    return id;
  });

  if (!input.isInternal) {
    await notify(db, {
      userId: ticket.userId,
      type: "SUPPORT_TICKET_REPLY",
      title: "Support replied to your ticket",
      body: input.body.slice(0, 140),
      context: { ticketId },
      eventKey: notificationEventKey("SUPPORT_TICKET_REPLY", ticketId, messageId),
    });
  }

  return { messageId, status: nextStatus };
}
