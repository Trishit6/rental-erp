import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { orderEvents } from "../schema";
import type { ActorRole, OrderEventType } from "./enums";

/**
 * The order timeline.
 *
 * ## Why this exists as a module
 *
 * `order_events` is written from three places now — order creation, the seller
 * desk and the admin desk — and read from one. Keeping the *writer* here (rather
 * than inserting at each call site) means one definition of the column bounds,
 * one place that decides a failed append is not worth failing the request over,
 * and one place that knows how the idempotency key behaves.
 *
 * ## Why a failed append is swallowed
 *
 * Every caller has already committed the change it is describing. If the timeline
 * insert then failed, the correct outcome is "the order moved, the note was lost"
 * — never a 500 that invites a retry which re-applies the move. A missing line in
 * a UI timeline is a cosmetic loss; a double status change is not.
 */

/** The shape a writer supplies. `toStatus` is required — the column is. */
export type OrderEventWrite = {
  orderId: number;
  type: OrderEventType;
  /** The status the order is in *after* this event. For a note, the current one. */
  toStatus: string;
  fromStatus?: string | null;
  actorId?: number | null;
  actorRole?: ActorRole | null;
  note?: string | null;
  /** Safe JSON (a reason code, a refund id). Never a secret. */
  metadata?: Record<string, unknown> | null;
  /**
   * The once-and-only-once key for retried writers, from `orderEventKey`.
   *
   * Supplying it is what makes "log the status move, then retry the whole request"
   * produce one line rather than two.
   */
  eventKey?: string | null;
};

/** The narrow `db` surface the writer needs, so it composes inside a transaction. */
export type EventExecutor = { insert: typeof db.insert };

const NOTE_MAX = 300;
const METADATA_MAX = 4_000;

/**
 * A stable key for one occurrence of one event on one order.
 *
 * Mirrors `notificationEventKey`: the type, the order, and an optional
 * discriminator for events that can legitimately recur (a second refund). The
 * discriminator is ignored when empty so `""` and `undefined` cannot produce two
 * different keys for the same occurrence.
 */
export function orderEventKey(
  type: string,
  orderId: number,
  discriminator?: string | number | null,
): string {
  const tail = discriminator === undefined || discriminator === null || discriminator === "" ? "" : `:${discriminator}`;
  return `${type}:${orderId}${tail}`.slice(0, 190);
}

function isDuplicateKey(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "ER_DUP_ENTRY" || code === "SQLITE_CONSTRAINT") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.toLowerCase().includes("duplicate");
}

export async function recordOrderEvent(
  executor: EventExecutor,
  event: OrderEventWrite,
): Promise<void> {
  try {
    await executor.insert(orderEvents).values({
      orderId: event.orderId,
      type: event.type,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus,
      actorId: event.actorId ?? null,
      actorRole: event.actorRole ?? null,
      note: event.note ? event.note.slice(0, NOTE_MAX) : null,
      metadata: event.metadata ? JSON.stringify(event.metadata).slice(0, METADATA_MAX) : null,
      eventKey: event.eventKey ?? null,
    });
  } catch (error) {
    if (isDuplicateKey(error)) return;
    console.error("[order-events] failed to append event", error);
  }
}

export type OrderTimelineEntry = {
  id: number;
  type: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: number | null;
  actorRole: string | null;
  note: string | null;
  metadata: string | null;
  createdAt: Date;
};

/** One order's timeline, oldest first. */
export async function listOrderTimeline(orderId: number): Promise<OrderTimelineEntry[]> {
  return db
    .select({
      id: orderEvents.id,
      type: orderEvents.type,
      fromStatus: orderEvents.fromStatus,
      toStatus: orderEvents.toStatus,
      actorId: orderEvents.actorId,
      actorRole: orderEvents.actorRole,
      note: orderEvents.note,
      metadata: orderEvents.metadata,
      createdAt: orderEvents.createdAt,
    })
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.createdAt), asc(orderEvents.id));
}
