import { z } from "zod";
import { and, count, desc, eq, inArray, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
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

/** The staff ticket status/priority vocabularies, as Zod enums (PROMPT 30). */
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

/**
 * A staff edit to a ticket's workflow fields (PROMPT 30).
 *
 * Deliberately narrow: the subject, the requester and the message thread are not
 * editable here — a support agent tidies a ticket's *state*, and rewriting what a
 * customer wrote would make the thread a lie. `assigneeId: null` releases a claim.
 */
export const staffTicketUpdateSchema = z
  .object({
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    assigneeId: positiveId.nullable().optional(),
    /** Recorded in the audit log; `withAudit({ requireReason: true })` enforces it too. */
    reason: z.string().trim().min(3).max(300),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined || value.priority !== undefined || value.assigneeId !== undefined,
    { message: "Nothing to update." },
  );

export type StaffTicketUpdateInput = z.infer<typeof staffTicketUpdateSchema>;

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
  /**
   * An internal note is visible to staff only. The customer read filters these rows
   * out in SQL, so the flag is always `false` there; the staff read needs it to label
   * the line.
   */
  isInternal: boolean;
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
      isInternal: ticketMessages.isInternal,
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
    isInternal: message.isInternal,
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

/** The requester and the assignee join the same table, so the assignee is aliased. */
const assigneeUser = alias(users, "assignee_user");

export type StaffTicketSummary = TicketSummary & {
  userId: number;
  requesterName: string;
  requesterEmail: string;
  assigneeId: number | null;
  assigneeName: string | null;
  slaDueAt: Date | null;
};

export type StaffTicketFilters = {
  page: number;
  pageSize: number;
  status?: TicketStatus;
  priority?: TicketPriority;
  /** `"me"` scopes to the viewer's claims; `"unassigned"` to the shared pool. */
  assignee?: "me" | "unassigned";
  search?: string;
};

export async function listTicketsForStaff(
  viewerId: number,
  options: StaffTicketFilters,
): Promise<{ rows: StaffTicketSummary[]; pagination: ReturnType<typeof buildPagination> }> {
  const conditions: SQL[] = [];
  if (options.status) conditions.push(eq(supportTickets.status, options.status));
  if (options.priority) conditions.push(eq(supportTickets.priority, options.priority));
  if (options.assignee === "me") conditions.push(eq(supportTickets.assigneeId, viewerId));
  if (options.assignee === "unassigned") conditions.push(isNull(supportTickets.assigneeId));
  if (options.search) {
    const pattern = `%${options.search}%`;
    conditions.push(
      or(
        like(supportTickets.ticketNumber, pattern),
        like(supportTickets.subject, pattern),
        like(users.name, pattern),
        like(users.email, pattern),
      )!,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .where(where);

  const rows = await db
    .select({
      ...summaryColumns(),
      userId: supportTickets.userId,
      requesterName: users.name,
      requesterEmail: users.email,
      assigneeId: supportTickets.assigneeId,
      assigneeName: assigneeUser.name,
      slaDueAt: supportTickets.slaDueAt,
    })
    .from(supportTickets)
    .innerJoin(users, eq(users.id, supportTickets.userId))
    .leftJoin(assigneeUser, eq(assigneeUser.id, supportTickets.assigneeId))
    .where(where)
    .orderBy(desc(supportTickets.updatedAt))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize);

  return {
    rows: rows.map((row) => ({ ...row, messageCount: Number(row.messageCount) })),
    pagination: buildPagination(options.page, options.pageSize, Number(total)),
  };
}

/** The staff view of one ticket, with everything the agent's screen needs. */
export type StaffTicketDetail = TicketDetail & {
  userId: number;
  requester: { id: number; name: string; email: string };
  assignee: { id: number; name: string } | null;
  slaDueAt: Date | null;
  order: {
    id: number;
    orderNumber: string | null;
    status: string;
    paymentStatus: string;
    total: number;
    currency: string;
  } | null;
  rental: { id: number; status: string } | null;
};

export async function getStaffTicket(ticketId: number): Promise<StaffTicketDetail> {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket) throw new HttpError(404, "NOT_FOUND", "That ticket does not exist.");

  const [requester] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, ticket.userId))
    .limit(1);

  const assignee = ticket.assigneeId
    ? (
        await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.id, ticket.assigneeId))
          .limit(1)
      )[0] ?? null
    : null;

  const order = ticket.orderId
    ? (
        await db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            total: orders.total,
            currency: orders.currency,
          })
          .from(orders)
          .where(eq(orders.id, ticket.orderId))
          .limit(1)
      )[0] ?? null
    : null;

  const rental = ticket.rentalId
    ? (
        await db
          .select({ id: rentals.id, status: rentals.status })
          .from(rentals)
          .where(eq(rentals.id, ticket.rentalId))
          .limit(1)
      )[0] ?? null
    : null;

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
    requester: requester ?? { id: ticket.userId, name: "Unknown", email: "" },
    assignee,
    slaDueAt: ticket.slaDueAt,
    order,
    rental,
  };
}

/**
 * Change a ticket's workflow state (PROMPT 30).
 *
 * Status, priority and the assignee are the fields an agent works; the subject, the
 * requester and the thread are not editable here. Reaching a settled status stamps
 * `resolvedAt`/`closedAt` (and reopening clears them), so the timestamps keep meaning
 * what they say. Assigning is restricted to staff accounts — a ticket claimed by a
 * customer would vanish from every operator's queue.
 */
export async function updateStaffTicket(
  ticketId: number,
  input: StaffTicketUpdateInput,
): Promise<{
  id: number;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: number | null;
}> {
  const [ticket] = await db
    .select({
      id: supportTickets.id,
      userId: supportTickets.userId,
      ticketNumber: supportTickets.ticketNumber,
      status: supportTickets.status,
      priority: supportTickets.priority,
      assigneeId: supportTickets.assigneeId,
      resolvedAt: supportTickets.resolvedAt,
    })
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket) throw new HttpError(404, "NOT_FOUND", "That ticket does not exist.");

  if (input.assigneeId !== undefined && input.assigneeId !== null) {
    const [target] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, input.assigneeId))
      .limit(1);
    if (!target || target.role !== "ADMIN") {
      throw new HttpError(400, "INVALID_ASSIGNEE", "A ticket can only be assigned to a staff account.");
    }
  }

  const now = new Date();
  const patch: Partial<typeof supportTickets.$inferInsert> = {};
  if (input.status !== undefined) {
    patch.status = input.status;
    if (input.status === "RESOLVED") patch.resolvedAt = ticket.resolvedAt ?? now;
    if (input.status === "CLOSED") {
      patch.resolvedAt = ticket.resolvedAt ?? now;
      patch.closedAt = now;
    }
    // Moving back to an open state clears the settled timestamps so they do not
    // claim a ticket that is being worked is finished.
    if (input.status === "OPEN" || input.status === "PENDING" || input.status === "IN_PROGRESS") {
      patch.resolvedAt = null;
      patch.closedAt = null;
    }
  }
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;

  await db.update(supportTickets).set(patch).where(eq(supportTickets.id, ticketId));

  // Tell the requester when their ticket reaches a settled state — the one status
  // change they care about. Keyed on status so a retried request notifies once.
  if (input.status === "RESOLVED" || input.status === "CLOSED") {
    await notify(db, {
      userId: ticket.userId,
      type: "SUPPORT_TICKET_UPDATED",
      title: `Your ticket ${ticket.ticketNumber} is ${input.status === "CLOSED" ? "closed" : "resolved"}`,
      body: "Open the ticket to see the resolution.",
      context: { ticketId },
      eventKey: notificationEventKey("SUPPORT_TICKET_UPDATED", ticketId, input.status),
    });
  }

  return {
    id: ticketId,
    status: (input.status ?? ticket.status) as TicketStatus,
    priority: (input.priority ?? ticket.priority) as TicketPriority,
    assigneeId: input.assigneeId !== undefined ? input.assigneeId : ticket.assigneeId,
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
