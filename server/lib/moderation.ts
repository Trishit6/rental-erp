import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { z } from "zod";
import { db } from "../db";
import {
  adminAuditLog,
  messages,
  platformSettings,
  products,
  reports,
  reviews,
  users,
} from "../schema";
import { HttpError, paginationQuerySchema } from "./api";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";
import { restoreUser, suspendUser } from "./auth";
import { recordSecurityEvent } from "./security-log";
import { refreshProductRatings } from "./rating-aggregate";
import { invalidatePublicCache } from "./public-cache";

/**
 * The moderation decision surface (PROMPT 29).
 *
 * ## A report is a work item with a target
 *
 * A `reports` row names exactly one thing (enforced by `lib/reports.ts`): a
 * listing, an account, a review, a message, an order or a rental. This module is
 * what an operator does with that work item. It ships two kinds of value over the
 * report itself:
 *
 *  - **context** — who filed it, what the target currently is, and the history of
 *    what has already been tried (read from the audit log, which is the single
 *    source of truth for "what happened to this report");
 *  - **one-flow outcomes** — deciding a report can *also* act on the target it
 *    names (hide the listing, suspend the account), so the moderator does not open
 *    a report and a separate admin page to do one job twice.
 *
 * ## Why the verdict and the action share a transaction
 *
 * Marking a report "resolved because I hid the listing" and hiding the listing are
 * one fact, not two. If the process dies between them, the report lies about what
 * exists. So the report row and the target change commit together, and only the
 * side effects that have no transaction of their own (rating aggregates, account
 * suspension, notifications) run after.
 *
 * ## Notifying the reporter
 *
 * The acceptance criterion is that the reporter is told the outcome. They are told
 * with a `REPORT_DECIDED` notification addressed to their activity feed — the
 * verdict itself, the target label and the moderator's note.
 */

export const MODERATION_ACTIONS = [
  "RESOLVED",
  "DISMISSED",
  "REVIEW_HIDDEN",
  "REVIEW_RESTORED",
  "PRODUCT_HIDDEN",
  "PRODUCT_RESTORED",
  "USER_WARNED",
  "USER_SUSPENDED",
  "USER_RESTORED",
  "MESSAGE_DELETED",
] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** What the target change amounts to, in words a notification can carry. */
const OUTCOME_LABEL: Record<ModerationAction, string> = {
  RESOLVED: "your report was reviewed and no action was needed",
  DISMISSED: "your report was dismissed",
  REVIEW_HIDDEN: "the review you reported was hidden",
  REVIEW_RESTORED: "the review you reported is visible again",
  PRODUCT_HIDDEN: "the listing you reported was hidden",
  PRODUCT_RESTORED: "the listing you reported is live again",
  USER_WARNED: "the account you reported was warned",
  USER_SUSPENDED: "the account you reported was suspended",
  USER_RESTORED: "the account you reported is active again",
  MESSAGE_DELETED: "the message you reported was removed",
};

/** The target kind each action may be applied to. `null` = any target. */
const ACTION_TARGETS: Partial<Record<ModerationAction, keyof typeof reports.$inferInsert>> = {
  REVIEW_HIDDEN: "reviewId",
  REVIEW_RESTORED: "reviewId",
  PRODUCT_HIDDEN: "productId",
  PRODUCT_RESTORED: "productId",
  USER_WARNED: "reportedUserId",
  USER_SUSPENDED: "reportedUserId",
  USER_RESTORED: "reportedUserId",
  MESSAGE_DELETED: "messageId",
};

export const moderationDecisionSchema = z
  .object({
    action: z.enum(MODERATION_ACTIONS),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export type ModerationDecisionInput = z.infer<typeof moderationDecisionSchema>;

/* ---------------------------------- queue ----------------------------------- */

/** The target column a report can name, mapped to the plural-free noun the UI and filters use. */
const TARGET_TYPE_BY_COLUMN: Record<string, string> = {
  productId: "product",
  reportedUserId: "user",
  reviewId: "review",
  messageId: "message",
  orderId: "order",
  rentalId: "rental",
};

export const moderationQueueQuerySchema = paginationQuerySchema.extend({
  status: z.string().trim().optional().catch(undefined),
  target: z
    .enum(["product", "user", "review", "message", "order", "rental"])
    .optional()
    .catch(undefined),
  search: z.string().trim().max(120).catch("").default(""),
});

export type ModerationQueueQuery = z.infer<typeof moderationQueueQuerySchema>;

export type ModerationReportRow = {
  id: number;
  status: string;
  action: string | null;
  actionNote: string | null;
  reason: string;
  details: string | null;
  targetType: string;
  targetId: number;
  /** The headline of the reported thing: listing title, account name, review snippet, message snippet. */
  targetLabel: string;
  reporterName: string;
  resolvedByName: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

function targetColumnOf(row: Record<string, unknown>): string | null {
  for (const column of Object.keys(TARGET_TYPE_BY_COLUMN)) {
    if (row[column] != null) return column;
  }
  return null;
}

function headlineFor(targetType: string, row: Record<string, unknown>): string {
  switch (targetType) {
    case "product":
      return (row.productTitle as string) ?? "—";
    case "user":
      return (row.userName as string) ?? "—";
    case "review":
      return ((row.reviewSnippet as string) ?? "—").slice(0, 160);
    case "message":
      return ((row.messageSnippet as string) ?? "—").slice(0, 160);
    case "order":
      return `order #${String(row.orderId)}`;
    case "rental":
      return `rental #${String(row.rentalId)}`;
    default:
      return "—";
  }
}

/**
 * The moderation queue, open work first.
 *
 * Enriched with the reporter's name and a headline of each target so a moderator
 * can triage without opening every row. Capped: a queue that long is a different
 * product, and per-row detail is where a moderator works an item.
 */
export async function listModerationReports(
  query: ModerationQueueQuery,
): Promise<{ rows: ModerationReportRow[]; total: number }> {
  const conditions: SQL[] = [];
  if (query.status && (["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const).includes(query.status as never)) {
    conditions.push(eq(reports.status, query.status));
  }
  if (query.target) {
    const column = Object.entries(TARGET_TYPE_BY_COLUMN).find(
      ([, value]) => value === query.target,
    )?.[0];
    if (column) conditions.push(sql`${reports[column as "productId"]} IS NOT NULL`);
  }
  let search: SQL | undefined;
  if (query.search) {
    const pattern = `%${query.search}%`;
    search =
      or(
        like(reports.reason, pattern),
        like(reports.details, pattern),
        like(products.title, pattern),
        like(reportedUsers.name, pattern),
        like(reportedUsers.email, pattern),
        like(reviews.comment, pattern),
        like(messages.body, pattern),
      ) ?? undefined;
  }
  const where = and(...conditions, search);

  // The queue is a status walk in date order (see the schema's index comment).
  const statusWalk = sql`FIELD(${reports.status}, 'OPEN','IN_REVIEW','RESOLVED','DISMISSED')`;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: reports.id,
        status: reports.status,
        action: reports.action,
        actionNote: reports.actionNote,
        reason: reports.reason,
        details: reports.details,
        productId: reports.productId,
        reportedUserId: reports.reportedUserId,
        reviewId: reports.reviewId,
        messageId: reports.messageId,
        orderId: reports.orderId,
        rentalId: reports.rentalId,
        productTitle: products.title,
        userName: reportedUsers.name,
        reviewSnippet: reviews.comment,
        messageSnippet: messages.body,
        reporterName: reporters.name,
        resolvedByName: resolvers.name,
        createdAt: reports.createdAt,
        resolvedAt: reports.resolvedAt,
      })
      .from(reports)
      .innerJoin(reporters, eq(reports.reporterId, reporters.id))
      .leftJoin(resolvers, eq(reports.resolvedById, resolvers.id))
      .leftJoin(products, eq(reports.productId, products.id))
      .leftJoin(reportedUsers, eq(reports.reportedUserId, reportedUsers.id))
      .leftJoin(reviews, eq(reports.reviewId, reviews.id))
      .leftJoin(messages, eq(reports.messageId, messages.id))
      .where(where)
      .orderBy(asc(statusWalk), desc(reports.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: sql<number>`COUNT(*)` }).from(reports).where(where),
  ]);

  const rowsOut: ModerationReportRow[] = rows.map((row) => {
    const column = targetColumnOf(row);
    const targetType = column ? TARGET_TYPE_BY_COLUMN[column] : "unknown";
    return {
      id: row.id,
      status: row.status,
      action: row.action,
      actionNote: row.actionNote,
      reason: row.reason,
      details: row.details,
      targetType,
      targetId: (row[column as "productId"] as number) ?? (row.id as number),
      targetLabel: headlineFor(targetType, { ...row }),
      reporterName: row.reporterName,
      resolvedByName: row.resolvedByName,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    };
  });

  return { rows: rowsOut, total: Number(totalRow?.value ?? 0) };
}

/* ---------------------------------- detail ---------------------------------- */

export type ModerationReportDetail = {
  report: {
    id: number;
    status: string;
    action: string | null;
    actionNote: string | null;
    reason: string;
    details: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
  };
  reporter: { id: number; name: string; email: string };
  resolvedBy: { id: number; name: string } | null;
  target: {
    type: string;
    id: number;
    headline: string;
  };
  history: {
    id: number;
    action: string;
    details: string | null;
    reason: string | null;
    adminName: string | null;
    actorRole: string | null;
    createdAt: Date;
  }[];
};

export async function getModerationReportDetail(id: number): Promise<ModerationReportDetail | null> {
  const [row] = await db
    .select({
      id: reports.id,
      reporterId: reports.reporterId,
      resolvedById: reports.resolvedById,
      status: reports.status,
      action: reports.action,
      actionNote: reports.actionNote,
      reason: reports.reason,
      details: reports.details,
      productId: reports.productId,
      reportedUserId: reports.reportedUserId,
      reviewId: reports.reviewId,
      messageId: reports.messageId,
      orderId: reports.orderId,
      rentalId: reports.rentalId,
      productTitle: products.title,
      userName: reportedUsers.name,
      userEmail: reportedUsers.email,
      reviewSnippet: reviews.comment,
      messageSnippet: messages.body,
      reporterName: reporters.name,
      reporterEmail: reporters.email,
      resolvedByName: resolvers.name,
      createdAt: reports.createdAt,
      resolvedAt: reports.resolvedAt,
    })
    .from(reports)
    .innerJoin(reporters, eq(reports.reporterId, reporters.id))
    .leftJoin(resolvers, eq(reports.resolvedById, resolvers.id))
    .leftJoin(products, eq(reports.productId, products.id))
    .leftJoin(reportedUsers, eq(reports.reportedUserId, reportedUsers.id))
    .leftJoin(reviews, eq(reports.reviewId, reviews.id))
    .leftJoin(messages, eq(reports.messageId, messages.id))
    .where(eq(reports.id, id))
    .limit(1);
  if (!row) return null;

  const column = targetColumnOf(row);
  const targetType = column ? TARGET_TYPE_BY_COLUMN[column] : "unknown";
  const targetId = (row[column as "productId"] as number) ?? row.id;

  const auditRows = await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      details: adminAuditLog.details,
      reason: adminAuditLog.reason,
      adminId: adminAuditLog.adminId,
      actorRole: adminAuditLog.actorRole,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(and(eq(adminAuditLog.entityType, "report"), eq(adminAuditLog.entityId, id)))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(20);

  const adminIds = [...new Set(auditRows.map((entry) => entry.adminId))];
  const adminNames = adminIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, adminIds))
    : [];
  const nameById = new Map(adminNames.map((admin) => [admin.id, admin.name]));

  return {
    report: {
      id: row.id,
      status: row.status,
      action: row.action,
      actionNote: row.actionNote,
      reason: row.reason,
      details: row.details,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt,
    },
    reporter: { id: row.reporterId, name: row.reporterName, email: row.reporterEmail },
    resolvedBy: row.resolvedByName
      ? { id: row.resolvedById ?? 0, name: row.resolvedByName }
      : null,
    target: { type: targetType, id: targetId, headline: headlineFor(targetType, { ...row }) },
    history: auditRows.map((entry) => ({
      id: entry.id,
      action: entry.action,
      details: entry.details,
      reason: entry.reason,
      adminName: nameById.get(entry.adminId) ?? null,
      actorRole: entry.actorRole,
      createdAt: entry.createdAt,
    })),
  };
}

/* ------------------------------ the decision -------------------------------- */

export type ModerationDecisionOutcome = {
  id: number;
  status: string;
  action: ModerationAction;
  outcomeLabel: string;
  applied: boolean;
};

type Moderator = { id: number; role: string };

/**
 * Decide a report — and, when the action names the target, carry that action out
 * in the same transaction. Idempotent: a decided report reports `applied: false`
 * rather than re-doing the target work.
 */
export async function applyModerationDecision(
  actor: Moderator,
  reportId: number,
  input: ModerationDecisionInput,
): Promise<ModerationDecisionOutcome> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new HttpError(400, "REASON_REQUIRED", "A moderation decision needs a reason.");
  }

  const deferred: Array<() => void | Promise<void>> = [];

  const result = await db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1)
      .for("update");
    if (!report) throw new HttpError(404, "NOT_FOUND", "Report not found.");

    if (report.status !== "OPEN" && report.status !== "IN_REVIEW") {
      return {
        id: report.id,
        status: report.status,
        action: (report.action ?? input.action) as ModerationAction,
        outcomeLabel: OUTCOME_LABEL[(report.action ?? "RESOLVED") as ModerationAction],
        applied: false,
      };
    }

    const requiredColumn = ACTION_TARGETS[input.action];
    if (requiredColumn !== undefined && report[requiredColumn] === null) {
      throw new HttpError(
        409,
        "ACTION_TARGET_MISMATCH",
        `A ${input.action} decision cannot be applied to this report's target.`,
      );
    }

    // --- the target change, in the same transaction as the verdict -------------
    switch (input.action) {
      case "MESSAGE_DELETED":
        await tx.delete(messages).where(eq(messages.id, report.messageId!));
        break;
      case "REVIEW_HIDDEN":
      case "REVIEW_RESTORED": {
        const status = input.action === "REVIEW_HIDDEN" ? "HIDDEN" : "PUBLISHED";
        const [review] = await tx
          .select({ id: reviews.id, productId: reviews.productId })
          .from(reviews)
          .where(eq(reviews.id, report.reviewId!))
          .limit(1);
        if (!review) throw new HttpError(404, "NOT_FOUND", "The reported review no longer exists.");
        await tx
          .update(reviews)
          .set({ status, updatedAt: new Date() })
          .where(eq(reviews.id, review.id));
        const productId = review.productId;
        deferred.push(() => refreshProductRatings([productId]));
        deferred.push(() => invalidatePublicCache("product:"));
        break;
      }
      case "PRODUCT_HIDDEN":
      case "PRODUCT_RESTORED": {
        const status = input.action === "PRODUCT_HIDDEN" ? "PAUSED" : "PUBLISHED";
        const [product] = await tx
          .select({ id: products.id, status: products.status })
          .from(products)
          .where(eq(products.id, report.productId!))
          .limit(1);
        if (!product) throw new HttpError(404, "NOT_FOUND", "The reported listing no longer exists.");
        await tx
          .update(products)
          .set({ status, updatedAt: new Date() })
          .where(eq(products.id, product.id));
        deferred.push(() => invalidatePublicCache("product:"));
        break;
      }
      case "USER_SUSPENDED": {
        const userId = report.reportedUserId!;
        deferred.push(async () => {
          await suspendUser(userId);
          await recordSecurityEvent({
            userId,
            type: "ACCOUNT_SUSPENDED",
            details: { via: "moderation", reportId: report.id, reason },
          });
        });
        break;
      }
      case "USER_RESTORED": {
        const userId = report.reportedUserId!;
        deferred.push(async () => {
          await restoreUser(userId);
          await recordSecurityEvent({
            userId,
            type: "ACCOUNT_UNSUSPENDED",
            details: { via: "moderation", reportId: report.id, reason },
          });
        });
        break;
      }
      case "USER_WARNED": {
        const userId = report.reportedUserId!;
        deferred.push(async () => {
          await notify(db, {
            userId,
            type: "ACCOUNT_WARNED",
            title: "A warning has been recorded on your account",
            body: reason,
            eventKey: notificationEventKey("ACCOUNT_WARNED", userId, `report-${report.id}`),
          });
        });
        break;
      }
      case "RESOLVED":
      case "DISMISSED":
        break;
    }

    const decidedStatus = input.action === "DISMISSED" ? "DISMISSED" : "RESOLVED";
    await tx
      .update(reports)
      .set({
        status: decidedStatus,
        action: input.action,
        actionNote: reason,
        resolvedById: actor.id,
        resolvedAt: new Date(),
      })
      .where(eq(reports.id, report.id));

    // The reporter learns the verdict through their activity feed.
    await notify(tx, {
      userId: report.reporterId,
      type: "REPORT_DECIDED",
      title: "Your report was reviewed",
      body: `${OUTCOME_LABEL[input.action]}. ${reason}`,
      eventKey: notificationEventKey("REPORT_DECIDED", report.id),
    });

    return {
      id: report.id,
      status: decidedStatus,
      action: input.action,
      outcomeLabel: OUTCOME_LABEL[input.action],
      applied: true,
    };
  });

  // Side effects that have no transaction of their own, in order.
  for (const effect of deferred) {
    await effect();
  }

  return result;
}

/* ---------------------------------- bulk ------------------------------------ */

/**
 * Bulk actions are confined to the two that touch no target.
 *
 * Blanket-applying a suspension or a hide to "the reports I selected" is a
 * different (and much more dangerous) feature — an operator would be one inverted
 * filter away from hiding a category. Dismissing or clearing several reports in
 * one click is the common, safe case, and it is what the queue's bulk bar offers.
 */
export const BULK_MODERATION_ACTIONS = ["RESOLVED", "DISMISSED"] as const;
export type BulkModerationAction = (typeof BULK_MODERATION_ACTIONS)[number];

export const bulkModerationDecisionSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(200),
    action: z.enum(BULK_MODERATION_ACTIONS),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export type BulkModerationDecisionInput = z.infer<typeof bulkModerationDecisionSchema>;

export async function applyBulkModerationDecision(
  actor: Moderator,
  ids: number[],
  input: { action: BulkModerationAction; reason: string },
): Promise<{ applied: number; already: number }> {
  let applied = 0;
  let already = 0;
  for (const id of ids) {
    const outcome = await applyModerationDecision(actor, id, {
      action: input.action,
      reason: input.reason,
    });
    if (outcome.applied) applied += 1;
    else already += 1;
  }
  return { applied, already };
}

/* ------------------------------- flag words --------------------------------- */

export const FLAG_WORDS_SETTING_KEY = "moderation_flag_words";

/**
 * The configured keyword list that moderators keep in `platform_settings`.
 *
 * The setting may be absent (fresh system) — that is `[]`, not an error. The
 * value is a JSON array of plain strings; anything else is treated as empty so a
 * malformed write cannot make the queue throw.
 */
export async function getFlagWords(): Promise<string[]> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, FLAG_WORDS_SETTING_KEY))
    .limit(1);
  return readFlagWordsFromValue(row?.value);
}

/** Write the keyword list. Bounded to 200 words, each matching the column width. */
export async function setFlagWords(words: readonly string[], adminId: number): Promise<string[]> {
  const cleaned = [...new Set(words.map((word) => word.trim()).filter(Boolean))].slice(0, 200);
  for (const word of cleaned) {
    if (word.length > 80) throw new HttpError(400, "BAD_REQUEST", "Flag words are capped at 80 characters.");
  }
  await db
    .insert(platformSettings)
    .values({ key: FLAG_WORDS_SETTING_KEY, value: cleaned, description: "Moderation keyword flag list", updatedBy: adminId })
    .onDuplicateKeyUpdate({ set: { value: cleaned, updatedBy: adminId } });
  return cleaned;
}

/**
 * Which of the configured keywords a piece of text contains, in list order.
 * Pure so the flagging rule is testable without a database.
 */
export function matchingFlagWords(
  text: string | null | undefined,
  words: readonly string[],
): string[] {
  const haystack = (text ?? "").toLowerCase();
  return words
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0 && haystack.includes(word));
}

function readFlagWordsFromValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((word) => String(word)).slice(0, 200);
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((word) => String(word)).slice(0, 200) : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Aliases so the reporter, resolver and reported-user joins read differently.
const reporters = alias(users, "reporters");
const resolvers = alias(users, "resolvers");
const reportedUsers = alias(users, "reported_users");