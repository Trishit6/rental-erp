import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  conversationParticipants,
  messages,
  orderItems,
  orders,
  products,
  rentals,
  reports,
  reviews,
  users,
} from "../schema";
import { HttpError } from "./api";
import { notificationEventKey } from "./notification-events";
import type { NotificationEntityType } from "./notification-events";
import { notifyAdmins } from "./notifications";

/**
 * Report submission (PROMPT 18).
 *
 * ## One thing per report
 *
 * A report names the thing being reported, not the person reporting it (that is the
 * session) and not "everything about this user". Six optional target columns carry
 * that, and this module — not the database — enforces "exactly one", because a
 * `CHECK` across six nullable columns is unreadable and brittle to extend. The
 * refinement is the one place the rule lives, so the route and the admin queue
 * cannot disagree about what a valid report is.
 *
 * ## Existence and access are checked, not assumed
 *
 * A report is appended to a moderation queue that a human will act on, so a row
 * naming a product or message that does not exist is a broken work item, and a row
 * naming a message in a conversation the reporter is not in is either a bug or an
 * attempt to make a moderator open a thread on command. Both are refused here,
 * where the ids are still in scope, rather than discovered by whoever works the
 * queue. The refusal is a `404`, deliberately: it does not confirm whether the
 * target exists.
 */

const positiveId = z.number().int().positive();

/**
 * The six columns a report may name, in a stable order. The schema below uses this
 * list both to declare the fields and to enforce "exactly one", so adding a seventh
 * target is one line here rather than a field a validation branch can silently miss.
 */
const TARGET_FIELDS = [
  "productId",
  "reportedUserId",
  "reviewId",
  "messageId",
  "orderId",
  "rentalId",
] as const;

type ReportTargetField = (typeof TARGET_FIELDS)[number];

export const reportInputSchema = z
  .object({
    productId: positiveId.optional(),
    reportedUserId: positiveId.optional(),
    reviewId: positiveId.optional(),
    messageId: positiveId.optional(),
    orderId: positiveId.optional(),
    rentalId: positiveId.optional(),
    // Kept short and open: the spike of a report is the detail, and `details` is
    // where it goes. The bound matches the `reason` column and the legacy endpoint.
    reason: z.string().trim().min(3).max(32),
    details: z.string().trim().max(1000).optional(),
  })
  .strict()
  /**
   * "Exactly one target" is a schema rule, not a handler rule, so the route rejects a
   * body naming none or several before it opens a query — and so the rule is testable
   * without a database.
   */
  .superRefine((value, ctx) => {
    const provided = TARGET_FIELDS.filter((field) => value[field] !== undefined);
    if (provided.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Report exactly one product, seller, review, message, order or rental.",
      });
    }
  });

export type ReportInput = z.infer<typeof reportInputSchema>;

type ResolvedTarget = {
  field: ReportTargetField;
  id: number;
  /** A noun for the admin notification body. */
  label: string;
  entityType: NotificationEntityType | null;
  entityId: number | null;
};

/** The ids in `input` that name a target, in stable order. */
function providedTargets(input: ReportInput): ReportTargetField[] {
  return TARGET_FIELDS.filter((field) => input[field] !== undefined);
}

/**
 * Resolve the single target a report names, proving it exists and that the reporter
 * may see it. Throws a `404` for anything unresolvable so a report never reveals
 * whether an id exists to a caller who is not allowed to know.
 */
async function resolveTarget(reporterId: number, input: ReportInput): Promise<ResolvedTarget> {
  const provided = providedTargets(input);
  if (provided.length !== 1) {
    throw new HttpError(400, "BAD_REQUEST", "Report exactly one product, seller, review, message, order or rental.");
  }
  const field = provided[0];
  const id = input[field] as number;

  switch (field) {
    case "productId": {
      const [row] = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, id))
        .limit(1);
      if (!row) throw new HttpError(404, "NOT_FOUND", "That listing no longer exists.");
      return { field, id, label: "a listing", entityType: "LISTING", entityId: id };
    }

    case "reportedUserId": {
      if (id === reporterId) {
        throw new HttpError(400, "BAD_REQUEST", "You cannot report yourself.");
      }
      const [row] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!row) throw new HttpError(404, "NOT_FOUND", "That account no longer exists.");
      return { field, id, label: "an account", entityType: "ACCOUNT", entityId: id };
    }

    case "reviewId": {
      const [row] = await db
        .select({ id: reviews.id, productId: reviews.productId })
        .from(reviews)
        .where(eq(reviews.id, id))
        .limit(1);
      if (!row) throw new HttpError(404, "NOT_FOUND", "That review no longer exists.");
      return { field, id, label: "a review", entityType: "PRODUCT", entityId: row.productId };
    }

    case "messageId": {
      const [row] = await db
        .select({ id: messages.id, conversationId: messages.conversationId })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);
      if (!row) throw new HttpError(404, "NOT_FOUND", "That message no longer exists.");
      // Membership is the gate: a report is the *workflow* by which a conversation
      // becomes visible to staff, so only a participant may open that workflow on it.
      const [membership] = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, row.conversationId),
            eq(conversationParticipants.userId, reporterId),
          ),
        )
        .limit(1);
      if (!membership) throw new HttpError(404, "NOT_FOUND", "That message no longer exists.");
      return {
        field,
        id,
        label: "a message",
        entityType: "CONVERSATION",
        entityId: row.conversationId,
      };
    }

    case "orderId": {
      const [row] = await db
        .select({ id: orders.id, userId: orders.userId })
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);
      if (!row) throw new HttpError(404, "NOT_FOUND", "That order no longer exists.");
      // The buyer owns the order; a seller may report one of their own lines.
      if (row.userId !== reporterId) {
        const [sellerLine] = await db
          .select({ id: orderItems.id })
          .from(orderItems)
          .where(and(eq(orderItems.orderId, id), eq(orderItems.sellerId, reporterId)))
          .limit(1);
        if (!sellerLine) throw new HttpError(404, "NOT_FOUND", "That order no longer exists.");
      }
      return { field, id, label: "an order", entityType: "ORDER", entityId: id };
    }

    case "rentalId": {
      const [row] = await db
        .select({ id: rentals.id, renterId: rentals.renterId, ownerId: rentals.ownerId })
        .from(rentals)
        .where(eq(rentals.id, id))
        .limit(1);
      if (!row) throw new HttpError(404, "NOT_FOUND", "That rental no longer exists.");
      if (row.renterId !== reporterId && row.ownerId !== reporterId) {
        throw new HttpError(404, "NOT_FOUND", "That rental no longer exists.");
      }
      return { field, id, label: "a rental", entityType: "RENTAL", entityId: id };
    }
  }
}

/**
 * Store a report and wake the moderation queue.
 *
 * The notification is keyed on the report row, so however many times a client
 * retries the submission, an administrator is told about the report once.
 */
export async function createReport(
  reporterId: number,
  input: ReportInput,
): Promise<{ id: number }> {
  const target = await resolveTarget(reporterId, input);

  const values: typeof reports.$inferInsert = {
    reporterId,
    reason: input.reason,
    details: input.details,
  };
  values[target.field] = target.id;

  const [created] = await db.insert(reports).values(values).$returningId();
  const reportId = Number(created.id);

  const [reporter] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, reporterId))
    .limit(1);

  await notifyAdmins(db, {
    type: "ADMIN_SUSPICIOUS_ACTIVITY",
    title: "New report",
    body: `${reporter?.name ?? "A user"} reported ${target.label}: ${input.reason}.`,
    relatedEntityType: target.entityType,
    relatedEntityId: target.entityId,
    eventKey: notificationEventKey("ADMIN_SUSPICIOUS_ACTIVITY", reportId),
    metadata: { reportId, target: target.field, targetId: target.id },
  });

  return { id: reportId };
}
