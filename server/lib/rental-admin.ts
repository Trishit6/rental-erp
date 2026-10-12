import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { orders, products, refunds, rentalEvents, rentals, users } from "../schema";
import { HttpError } from "./api";
import type { ActorRole } from "./enums";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";
import { orderEventKey, recordOrderEvent } from "./order-events";
import { createRefundNumber } from "./reference-numbers";
import {
  buildRentalTimeline,
  IN_HAND_STATUSES,
  recordRentalEvent,
  RENTAL_STATUSES,
  type RentalEventType,
  type RentalStatus,
} from "./rental-lifecycle";

/**
 * The admin rental desk (PROMPT 27).
 *
 * ## Forcing a status, not inventing one
 *
 * "Force status within allowed transitions" is taken literally: the administrator
 * may step to any status the machine lists as reachable from the current one, and
 * no further. The map is deliberately more permissive than the automatic
 * reconciliation (`reconcileRentalStatuses`) — an operator resolves real-world
 * tangles — but it still refuses a jump that would make the lifecycle incoherent
 * (a `CONFIRMED` rental to `COMPLETED`, say). Terminal states stay terminal.
 *
 * ## Deposit settlement *is* the completion
 *
 * The lifecycle says `RETURNED → COMPLETED` waits on the deposit release. So
 * settling the deposit here releases the refundable amount as a `PENDING` refund
 * (money movement belongs to the payment architecture), records the deduction,
 * and moves the rental to `COMPLETED` in one transaction — there is no separate
 * "complete" button that could leave a rental holding an unreleased deposit.
 */

/* --------------------------------- machine ---------------------------------- */

export const ADMIN_RENTAL_TRANSITIONS: Record<RentalStatus, RentalStatus[]> = {
  CONFIRMED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["RETURN_PENDING", "OVERDUE", "RETURNED", "DISPUTED"],
  RETURN_PENDING: ["RETURNED", "ACTIVE", "DISPUTED"],
  OVERDUE: ["RETURN_PENDING", "RETURNED", "DISPUTED"],
  RETURNED: ["COMPLETED", "DISPUTED"],
  DISPUTED: ["ACTIVE", "RETURNED", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function adminRentalNextStatuses(status: string): RentalStatus[] {
  return ADMIN_RENTAL_TRANSITIONS[status as RentalStatus] ?? [];
}

export function isAdminRentalTransition(from: string, to: string): boolean {
  if (from === to) return false;
  return adminRentalNextStatuses(from).includes(to as RentalStatus);
}

export function isForcibleRentalStatus(value: unknown): value is RentalStatus {
  return typeof value === "string" && (RENTAL_STATUSES as readonly string[]).includes(value);
}

/**
 * The recorded step a status change corresponds to, when one exists.
 *
 * `OVERDUE` and `DISPUTED` are absent on purpose. `OVERDUE` is *derived* from the
 * dates, not something that happened at a recorded moment, and `DISPUTED` is
 * opened through the dispute flow which records its own history. Neither has an
 * event type in `RENTAL_EVENT_TYPES`, and inventing one would violate the
 * `(rental_id, type)` uniqueness guarantee the lifecycle relies on.
 */
const STATUS_EVENT: Partial<Record<RentalStatus, RentalEventType>> = {
  ACTIVE: "STARTED",
  RETURN_PENDING: "RETURN_REQUESTED",
  RETURNED: "RETURNED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

/* ---------------------------------- detail ---------------------------------- */

export type AdminRentalDetail = {
  rental: {
    id: number;
    status: string;
    startDate: Date;
    endDate: Date;
    actualReturnDate: Date | null;
    returnRequestedAt: Date | null;
    completedAt: Date | null;
    dailyRate: number;
    rentalSubtotal: number;
    securityDeposit: number;
    deliveryFee: number;
    total: number;
    currency: string;
    extensionRequestedAt: Date | null;
    extensionRequestedDays: number | null;
    createdAt: Date;
  };
  product: { id: number; title: string; slug: string };
  order: { id: number; orderNumber: string | null; status: string; paymentStatus: string };
  renter: { id: number; name: string; email: string };
  owner: { id: number; name: string; email: string };
  events: { type: string; createdAt: string }[];
  timeline: ReturnType<typeof buildRentalTimeline>;
  /** `securityDeposit - released` once settled, or null while it is still held. */
  deposit: { held: number; settled: boolean; released: number | null };
};

export async function getAdminRentalDetail(id: number): Promise<AdminRentalDetail | null> {
  const [row] = await db
    .select({
      id: rentals.id,
      status: rentals.status,
      startDate: rentals.startDate,
      endDate: rentals.endDate,
      actualReturnDate: rentals.actualReturnDate,
      returnRequestedAt: rentals.returnRequestedAt,
      completedAt: rentals.completedAt,
      dailyRate: rentals.dailyRate,
      rentalSubtotal: rentals.rentalSubtotal,
      securityDeposit: rentals.securityDeposit,
      deliveryFee: rentals.deliveryFee,
      total: rentals.total,
      extensionRequestedAt: rentals.extensionRequestedAt,
      extensionRequestedDays: rentals.extensionRequestedDays,
      createdAt: rentals.createdAt,
      productId: products.id,
      productTitle: products.title,
      productSlug: products.slug,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      orderPaymentStatus: orders.paymentStatus,
      orderCurrency: orders.currency,
      renterId: rentals.renterId,
      ownerId: rentals.ownerId,
    })
    .from(rentals)
    .innerJoin(products, eq(rentals.productId, products.id))
    .innerJoin(orders, eq(rentals.orderId, orders.id))
    .where(eq(rentals.id, id))
    .limit(1);
  if (!row) return null;

  const [renterRows, ownerRows, eventRows, refundRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, row.renterId))
      .limit(1),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, row.ownerId))
      .limit(1),
    db
      .select({ type: rentalEvents.type, createdAt: rentalEvents.createdAt })
      .from(rentalEvents)
      .where(eq(rentalEvents.rentalId, id))
      .orderBy(asc(rentalEvents.createdAt)),
    db
      .select({ amount: refunds.amount, status: refunds.status })
      .from(refunds)
      .where(and(eq(refunds.orderId, row.orderId), eq(refunds.userId, row.renterId))),
  ]);

  const events = eventRows.map((event) => ({
    type: event.type,
    createdAt: event.createdAt.toISOString(),
  }));
  const released = refundRows
    .filter((refund) => refund.status !== "FAILED" && refund.status !== "CANCELLED")
    .reduce((sum, refund) => sum + refund.amount, 0);
  const settled = row.status === "COMPLETED" || row.status === "CANCELLED";

  return {
    rental: {
      id: row.id,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      actualReturnDate: row.actualReturnDate,
      returnRequestedAt: row.returnRequestedAt,
      completedAt: row.completedAt,
      dailyRate: row.dailyRate,
      rentalSubtotal: row.rentalSubtotal,
      securityDeposit: row.securityDeposit,
      deliveryFee: row.deliveryFee,
      total: row.total,
      currency: row.orderCurrency,
      extensionRequestedAt: row.extensionRequestedAt,
      extensionRequestedDays: row.extensionRequestedDays,
      createdAt: row.createdAt,
    },
    product: { id: row.productId, title: row.productTitle, slug: row.productSlug },
    order: {
      id: row.orderId,
      orderNumber: row.orderNumber,
      status: row.orderStatus,
      paymentStatus: row.orderPaymentStatus,
    },
    renter: renterRows[0] ?? { id: row.renterId, name: `#${row.renterId}`, email: "" },
    owner: ownerRows[0] ?? { id: row.ownerId, name: `#${row.ownerId}`, email: "" },
    events,
    timeline: buildRentalTimeline({
      events,
      status: row.status as RentalStatus,
      confirmedAt: row.createdAt.toISOString(),
    }),
    deposit: {
      held: row.securityDeposit,
      settled,
      released: settled ? released : null,
    },
  };
}

/* --------------------------------- actions ---------------------------------- */

type Actor = { id: number; role: ActorRole };

type RentalRef = {
  id: number;
  status: string;
  renterId: number;
  ownerId: number;
  productId: number;
};

/**
 * Move a rental to a reachable status.
 *
 * One transaction: the status write and the recorded step. The customer notice is
 * best-effort (see `notify`), but the step and the move are a unit, so the history
 * can never name a transition that did not commit.
 */
export async function forceAdminRentalStatus(
  actor: Actor,
  rental: RentalRef,
  target: RentalStatus,
): Promise<void> {
  if (!isAdminRentalTransition(rental.status, target)) {
    throw new HttpError(
      409,
      "TRANSITION_NOT_ALLOWED",
      `A rental cannot move from ${rental.status} to ${target}.`,
    );
  }
  const now = new Date();
  const patch: Record<string, unknown> = { status: target, updatedAt: now };
  if (target === "RETURNED") patch.actualReturnDate = now;
  if (target === "COMPLETED") patch.completedAt = now;

  await db.transaction(async (tx) => {
    await tx.update(rentals).set(patch).where(eq(rentals.id, rental.id));
    const event = STATUS_EVENT[target];
    if (event) await recordRentalEvent(tx, rental.id, event, { by: "ADMIN", adminId: actor.id });

    await notifyRentalStatus(tx, rental, target, actor.id);
  });
}

async function notifyRentalStatus(
  executor: Parameters<typeof notify>[0],
  rental: RentalRef,
  target: RentalStatus,
  adminId: number,
): Promise<void> {
  const context = { rentalId: rental.id, productId: rental.productId };
  if (target === "ACTIVE") {
    await notify(executor, {
      userId: rental.renterId,
      type: "RENTAL_ACTIVE",
      title: "Your rental has started",
      body: "An administrator marked your rental as started.",
      context,
      eventKey: notificationEventKey("RENTAL_ACTIVE", rental.id, adminId),
    });
  } else if (target === "RETURN_PENDING") {
    await notify(executor, {
      userId: rental.ownerId,
      type: "RENTAL_RETURN_REQUESTED",
      title: "A return is pending",
      body: "An administrator marked a rental of your item as awaiting return.",
      context,
      eventKey: notificationEventKey("RENTAL_RETURN_REQUESTED", rental.id, adminId),
    });
  } else if (target === "RETURNED") {
    await notifyParties(executor, rental, "RENTAL_RETURNED", "Rental returned", {
      renter: "Your rental has been marked returned.",
      owner: "A rental of your item has been marked returned.",
    }, adminId);
  } else if (target === "CANCELLED") {
    await notifyParties(executor, rental, "RENTAL_CANCELLED", "Rental cancelled", {
      renter: "An administrator cancelled your rental.",
      owner: "An administrator cancelled a rental of your item.",
    }, adminId);
  }
}

async function notifyParties(
  executor: Parameters<typeof notify>[0],
  rental: RentalRef,
  type: string,
  title: string,
  body: { renter: string; owner: string },
  adminId: number,
): Promise<void> {
  const context = { rentalId: rental.id, productId: rental.productId };
  await notify(executor, {
    userId: rental.renterId,
    type,
    title,
    body: body.renter,
    context,
    eventKey: notificationEventKey(type, rental.id, `${adminId}:renter`),
  });
  if (rental.ownerId !== rental.renterId) {
    await notify(executor, {
      userId: rental.ownerId,
      type,
      title,
      body: body.owner,
      context,
      eventKey: notificationEventKey(type, rental.id, `${adminId}:owner`),
    });
  }
}

export type DepositSettlement = {
  /** How much of the deposit is withheld (0 releases it in full). */
  deduction: number;
  reason: string;
};

/**
 * Release (and optionally deduct from) a rental's security deposit, completing it.
 *
 * The refundable amount becomes a `PENDING` refund — the money itself is moved by
 * the refund architecture — while the deduction is recorded on the order's
 * timeline with its reason, so a withheld deposit always has a stated cause.
 */
export async function settleAdminRentalDeposit(
  actor: Actor,
  rental: {
    id: number;
    status: string;
    orderId: number;
    orderItemId: number;
    renterId: number;
    ownerId: number;
    productId: number;
    securityDeposit: number;
    currency: string;
  },
  settlement: DepositSettlement,
): Promise<{ refundNumber: string | null; released: number; deduction: number }> {
  if (rental.status === "COMPLETED" || rental.status === "CANCELLED") {
    throw new HttpError(409, "ALREADY_SETTLED", "This rental's deposit has already been settled.");
  }
  const deduction = Math.floor(settlement.deduction);
  if (!Number.isFinite(deduction) || deduction < 0) {
    throw new HttpError(400, "INVALID_DEDUCTION", "A deduction cannot be negative.");
  }
  if (deduction > rental.securityDeposit) {
    throw new HttpError(
      409,
      "DEDUCTION_EXCEEDS_DEPOSIT",
      "A deduction cannot exceed the deposit held.",
    );
  }
  const reason = settlement.reason.trim();
  if ((deduction > 0 || rental.securityDeposit > 0) && reason.length < 3) {
    throw new HttpError(400, "REASON_REQUIRED", "Settling a deposit needs a reason.");
  }

  const released = rental.securityDeposit - deduction;
  const refundNumber = released > 0 ? createRefundNumber() : null;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(rentals)
      .set({ status: "COMPLETED", completedAt: now, updatedAt: now })
      .where(eq(rentals.id, rental.id));

    await recordRentalEvent(tx, rental.id, "COMPLETED", {
      by: "ADMIN",
      adminId: actor.id,
      released,
      deduction,
    });

    if (refundNumber) {
      await tx.insert(refunds).values({
        refundNumber,
        orderId: rental.orderId,
        orderItemId: rental.orderItemId,
        userId: rental.renterId,
        amount: released,
        currency: rental.currency,
        reason: `Security deposit ${deduction > 0 ? "partially " : ""}released: ${reason}`,
        status: "PENDING",
        createdBy: actor.id,
      });
    }

    await recordOrderEvent(tx, {
      orderId: rental.orderId,
      type: "REFUND",
      toStatus: "DEPOSIT_SETTLED",
      actorId: actor.id,
      actorRole: actor.role,
      note: reason,
      metadata: { deposit: rental.securityDeposit, released, deduction, refundNumber },
      eventKey: orderEventKey("REFUND", rental.orderId, `deposit:${rental.id}`),
    });

    if (released > 0) {
      await notify(tx, {
        userId: rental.renterId,
        type: "REFUND_REQUESTED",
        title: "Your security deposit is being released",
        body:
          deduction > 0
            ? `Part of your security deposit is being released after a deduction of ${(deduction / 100).toFixed(2)}.`
            : "Your security deposit is being released.",
        context: { rentalId: rental.id, productId: rental.productId },
        eventKey: notificationEventKey("REFUND_REQUESTED", rental.id, `deposit:${actor.id}`),
      });
    }
  });

  return { refundNumber, released, deduction };
}

export type ExtensionDecision = "APPROVE" | "REJECT";

/**
 * Decide an extension request that the renter already made.
 *
 * Approval moves the rental's end date; the extra days are quoted in the record
 * (rate × days) so the decision's money consequence is on the books, and an
 * administrator can see what was waived. Rejection only clears the request. Both
 * are recorded on the parent order's timeline and announced to the renter.
 */
export async function decideAdminRentalExtension(
  actor: Actor,
  rental: {
    id: number;
    status: string;
    orderId: number;
    renterId: number;
    productId: number;
    endDate: Date;
    dailyRate: number;
    extensionRequestedDays: number | null;
  },
  decision: ExtensionDecision,
  input: { days?: number; reason: string },
): Promise<{ days: number; newEndDate: Date | null }> {
  if (rental.extensionRequestedDays === null || rental.extensionRequestedDays <= 0) {
    throw new HttpError(409, "NO_REQUEST", "There is no pending extension request on this rental.");
  }
  if (["CANCELLED", "COMPLETED"].includes(rental.status)) {
    throw new HttpError(409, "CLOSED", "A closed rental cannot be extended.");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new HttpError(400, "REASON_REQUIRED", "A decision needs a reason.");
  }

  if (decision === "REJECT") {
    await db.transaction(async (tx) => {
      await tx
        .update(rentals)
        .set({ extensionRequestedAt: null, extensionRequestedDays: null, updatedAt: new Date() })
        .where(eq(rentals.id, rental.id));
      await recordExtensionNote(tx, actor, rental, `Extension declined: ${reason}`);
      await notifyRentalExtension(tx, rental, "Extension declined", reason, actor.id);
    });
    return { days: 0, newEndDate: null };
  }

  const days = Math.floor(input.days ?? rental.extensionRequestedDays);
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    throw new HttpError(400, "INVALID_DAYS", "An extension must be between 1 and 365 days.");
  }
  const newEndDate = new Date(rental.endDate.getTime() + days * 86_400_000);
  const quoted = rental.dailyRate * days;

  await db.transaction(async (tx) => {
    await tx
      .update(rentals)
      .set({
        endDate: newEndDate,
        extensionRequestedAt: null,
        extensionRequestedDays: null,
        updatedAt: new Date(),
      })
      .where(eq(rentals.id, rental.id));
    await recordExtensionNote(
      tx,
      actor,
      rental,
      `Extension approved for ${days} day(s): ${reason}`,
      { days, quoted, newEndDate: newEndDate.toISOString() },
    );
    await notifyRentalExtension(
      tx,
      rental,
      "Extension approved",
      `Your rental was extended by ${days} day(s), until ${newEndDate.toISOString().slice(0, 10)}.`,
      actor.id,
    );
  });

  return { days, newEndDate };
}

async function recordExtensionNote(
  executor: Parameters<typeof recordOrderEvent>[0],
  actor: Actor,
  rental: { id: number; orderId: number; status: string },
  note: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await recordOrderEvent(executor, {
    orderId: rental.orderId,
    type: "NOTE_ADDED",
    toStatus: rental.status,
    actorId: actor.id,
    actorRole: actor.role,
    note: note.slice(0, 300),
    metadata: { rentalId: rental.id, ...metadata },
  });
}

async function notifyRentalExtension(
  executor: Parameters<typeof notify>[0],
  rental: { id: number; renterId: number; productId: number },
  title: string,
  body: string,
  adminId: number,
): Promise<void> {
  await notify(executor, {
    userId: rental.renterId,
    type: "RENTAL_EXTENSION_DECIDED",
    title,
    body,
    context: { rentalId: rental.id, productId: rental.productId },
    eventKey: notificationEventKey("RENTAL_EXTENSION_DECIDED", rental.id, `${adminId}:${title}`),
  });
}

/** Whether an order has any rental the customer is physically holding. */
export async function hasActiveRentalOnOrder(orderId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(
      and(eq(rentals.orderId, orderId), inArray(rentals.status, IN_HAND_STATUSES)),
    )
    .limit(1);
  return row !== undefined;
}
