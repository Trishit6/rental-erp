import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { db } from "../db";
import { rentalEvents, rentals } from "../schema";
import { notificationEventKey } from "./notification-events";
import { notify } from "./notifications";

/**
 * Rental lifecycle.
 *
 * The backend is the source of truth for a rental's state. The client may render
 * a countdown, but it never decides whether a rental is active, overdue or
 * returnable — those are derived here and (where the transition is unambiguous)
 * persisted, so two tabs and the API always agree.
 *
 * ## The states
 *
 * `CONFIRMED → ACTIVE → RETURN_PENDING → RETURNED → COMPLETED`, plus
 * `CANCELLED` and `DISPUTED`.
 *
 * `UPCOMING` is intentionally **not** stored. A confirmed booking whose window
 * has not opened is `CONFIRMED` with a future `startDate`; storing a second
 * label for the same fact invites the two to disagree. Tabs are derived from
 * real dates instead.
 *
 * `EXPIRED` is likewise unused: a rental whose window closed without a return is
 * `OVERDUE`, which is the same information but actionable. No code path could
 * produce `EXPIRED`, and offering a filter for a state nothing can enter is a
 * filter that can only ever return nothing.
 */

export const RENTAL_STATUSES = [
  "CONFIRMED",
  "ACTIVE",
  "RETURN_PENDING",
  "OVERDUE",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
] as const;

export type RentalStatus = (typeof RENTAL_STATUSES)[number];

/** The four tabs the customer list offers. */
export const RENTAL_BUCKETS = ["upcoming", "active", "completed"] as const;
export type RentalBucket = (typeof RENTAL_BUCKETS)[number];

/** Statuses that mean "the customer is holding it, or it is due back". */
export const IN_HAND_STATUSES: RentalStatus[] = ["ACTIVE", "RETURN_PENDING", "OVERDUE"];

/** Statuses that mean "this story is over". */
export const CLOSED_STATUSES: RentalStatus[] = ["RETURNED", "COMPLETED", "CANCELLED"];

export function isRentalStatus(value: unknown): value is RentalStatus {
  return typeof value === "string" && (RENTAL_STATUSES as readonly string[]).includes(value);
}

export function isRentalBucket(value: unknown): value is RentalBucket {
  return typeof value === "string" && (RENTAL_BUCKETS as readonly string[]).includes(value);
}

/**
 * Which tab a rental belongs under, given its stored status and its start date.
 *
 * `now` is injectable so this stays a pure function and can be tested across
 * boundaries without freezing the clock.
 */
export function rentalBucket(
  status: RentalStatus,
  startDate: Date,
  now: Date = new Date(),
): RentalBucket {
  if (CLOSED_STATUSES.includes(status)) return "completed";
  if (IN_HAND_STATUSES.includes(status)) return "active";
  // CONFIRMED: upcoming until its window opens, active from that day on. A
  // day-precision date means "the start day" is when it begins.
  const start = startOfDay(startDate);
  const today = startOfDay(now);
  return start.getTime() > today.getTime() ? "upcoming" : "active";
}

function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export { addDays as addRentalDays, rentalDaysUntil } from "../../src/lib/pricing";

/**
 * The deposit's state, derived rather than stored.
 *
 * There is no deposit ledger in this schema and no refund execution in this
 * feature, so only two of the four possible states are ever reachable:
 * `HELD` while the item is out, `RELEASE_PENDING` once it has been returned.
 * `RELEASED` and `ADJUSTED` are deliberately never reported — claiming money has
 * been returned when no refund has been issued is exactly the kind of lie this
 * avoids.
 */
export type DepositStatus = "HELD" | "RELEASE_PENDING" | "RELEASED" | "ADJUSTED";

export function depositStatus(
  rentalStatus: RentalStatus,
  securityDeposit: number,
): DepositStatus | null {
  if (securityDeposit <= 0) return null;
  if (rentalStatus === "RETURNED" || rentalStatus === "COMPLETED") return "RELEASE_PENDING";
  if (rentalStatus === "CANCELLED") return "RELEASE_PENDING";
  return "HELD";
}

/* ------------------------------ rental events ------------------------------- */

/**
 * The steps a rental can be recorded as having been through.
 *
 * `DELIVERY_COMPLETED` is declared but never written today: no system in this
 * app knows when a courier handed an item over. It exists so a future logistics
 * integration has a home, and the timeline omits any step with no event rather
 * than showing a permanent "waiting".
 *
 * `OVERDUE` is deliberately absent. It is derived from the dates, not something
 * that happened at a recorded moment, and an event implies a timestamp.
 */
export const RENTAL_EVENT_TYPES = [
  "CONFIRMED",
  "DELIVERY_COMPLETED",
  "STARTED",
  "RETURN_REQUESTED",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
] as const;

export type RentalEventType = (typeof RENTAL_EVENT_TYPES)[number];

/** The order the timeline presents steps in, regardless of insert order. */
const EVENT_ORDER: RentalEventType[] = [
  "CONFIRMED",
  "DELIVERY_COMPLETED",
  "STARTED",
  "RETURN_REQUESTED",
  "RETURNED",
  "COMPLETED",
  "CANCELLED",
];

const EVENT_LABELS: Record<RentalEventType, string> = {
  CONFIRMED: "Rental confirmed",
  DELIVERY_COMPLETED: "Delivery completed",
  STARTED: "Rental started",
  RETURN_REQUESTED: "Return requested",
  RETURNED: "Returned",
  COMPLETED: "Completed",
  CANCELLED: "Rental cancelled",
};

/**
 * Record a step, ignoring a duplicate.
 *
 * `(rental_id, type)` is unique, and every type in the lifecycle can happen at
 * most once per rental. A retried request, a double-clicked button, or a second
 * reconciliation therefore cannot append a second event — and callers do not
 * have to check first, so the database stays the single arbiter of what happened.
 */
export async function recordRentalEvent(
  executor: Pick<typeof db, "insert">,
  rentalId: number,
  type: RentalEventType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await executor.insert(rentalEvents).values({
      rentalId,
      type,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 1062 is MySQL's duplicate-entry error. Anything else is a real failure and
    // must not be swallowed — a dropped event would be an invisible gap in a
    // customer's history.
    if (!message.includes("Duplicate") && !message.includes("duplicate")) throw error;
  }
}

/* ------------------------------ reconciliation ------------------------------ */

/**
 * Advance rentals whose dates have moved on, persist the result, and record the
 * step that happened.
 *
 * Two transitions are unambiguous from the dates alone and are therefore applied
 * server-side:
 *
 *  - a `CONFIRMED` booking whose start day has arrived is `ACTIVE` (and `STARTED`
 *    is recorded)
 *  - an `ACTIVE` booking whose end day has passed is `OVERDUE`
 *
 * Kept here rather than in the client because a countdown must never mutate
 * rental state: a customer with the page open at midnight would otherwise
 * rewrite their own rental. Idempotent and bounded — the selection only matches
 * rows in the old state, and the event insert is unique per (rental, type), so
 * a second call does nothing.
 *
 * Deliberately *not* automated: `RETURN_PENDING → RETURNED` (needs a physical
 * return), `RETURNED → COMPLETED` (needs the deposit release, which is a future
 * feature) and anything financial.
 */
export async function reconcileRentalStatuses(
  executor: typeof db,
  options: { renterId?: number; ownerId?: number } = {},
): Promise<void> {
  const scope = [];
  if (options.renterId !== undefined) scope.push(eq(rentals.renterId, options.renterId));
  if (options.ownerId !== undefined) scope.push(eq(rentals.ownerId, options.ownerId));
  const scoped = scope.length > 0 ? and(...scope) : undefined;

  // `CURDATE()` compares on the stored day, which is the precision the columns
  // hold — comparing a DATE to a full timestamp would start a rental at
  // midnight and mark it overdue mid-day.
  const starting = await executor
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.status, "CONFIRMED"), lte(rentals.startDate, sql`CURDATE()`), scoped));
  if (starting.length > 0) {
    const ids = starting.map((r) => r.id);
    await executor
      .update(rentals)
      .set({ status: "ACTIVE", updatedAt: new Date() })
      .where(inArray(rentals.id, ids));
    for (const id of ids) {
      await recordRentalEvent(executor, id, "STARTED");
    }
  }

  const ending = await executor
    .select({ id: rentals.id })
    .from(rentals)
    .where(
      and(
        eq(rentals.status, "ACTIVE"),
        lte(rentals.endDate, sql`CURDATE() - INTERVAL 1 DAY`),
        scoped,
      ),
    );
  if (ending.length > 0) {
    // No event for this one: overdue is derived from the dates, and an event
    // implies a recorded moment.
    await executor
      .update(rentals)
      .set({ status: "OVERDUE", updatedAt: new Date() })
      .where(
        inArray(
          rentals.id,
          ending.map((r) => r.id),
        ),
      );
  }

  // Announced last, deliberately. The transitions above are the state change; the
  // notices describe it. Running the announcements afterwards means a rental that has
  // *just* gone overdue in this same pass is reported as overdue, rather than
  // producing a "starting soon" and an "overdue" in the same breath.
  await announceRentalTransitions(executor, options);
}

/**
 * Turn the rentals that changed state into notifications.
 *
 * ## Why this runs off the same reconciliation pass
 *
 * There is no scheduler in this application — no cron, no queue, no worker. The
 * rental list, the rental detail page and the admin rentals table all already call
 * `reconcileRentalStatuses`, so the moment a rental *actually* begins or becomes
 * overdue is the moment one of those pages is read. Attaching the notice there means
 * there is exactly one place a rental can change state and therefore exactly one
 * place a notice can come from.
 *
 * ## Why the reminders cannot spam
 *
 * Every notification below carries a deterministic `eventKey` (`server/lib/
 * notification-events.ts`). The daily reminders additionally carry the date, so
 * today's "due tomorrow" and tomorrow's are different rows while a hundred reads
 * before either are all the same one. The unique index, not a "have I already said
 * this?" query, is what enforces it — so two people opening the page at the same
 * moment produce one notice between them rather than two.
 *
 * ## Who gets told
 *
 * The renter always; the owner only when the item is late. An owner has no action to
 * take about a rental starting, and a notice with no action is how a bell gets muted.
 */
export async function announceRentalTransitions(
  executor: Pick<typeof db, "insert" | "select">,
  options: { renterId?: number; ownerId?: number } = {},
): Promise<void> {
  const scope = [];
  if (options.renterId !== undefined) scope.push(eq(rentals.renterId, options.renterId));
  if (options.ownerId !== undefined) scope.push(eq(rentals.ownerId, options.ownerId));
  const scoped = scope.length > 0 ? and(...scope) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  const rows = await executor
    .select({
      id: rentals.id,
      productId: rentals.productId,
      renterId: rentals.renterId,
      ownerId: rentals.ownerId,
      status: rentals.status,
      startDate: rentals.startDate,
      endDate: rentals.endDate,
    })
    .from(rentals)
    .where(
      and(
        inArray(rentals.status, ["CONFIRMED", "ACTIVE", "RETURN_PENDING", "OVERDUE"]),
        scoped,
      ),
    )
    .limit(200);

  for (const rental of rows) {
    const context = { rentalId: rental.id, productId: rental.productId };

    // Starting tomorrow. Keyed on the date so it fires on the evening before, once.
    if (
      rental.status === "CONFIRMED" &&
      rental.startDate.toISOString().slice(0, 10) === addUtcDays(today, 1)
    ) {
      await notify(executor, {
        userId: rental.renterId,
        type: "RENTAL_STARTING_SOON",
        title: "Your rental starts tomorrow",
        body: "Your rental begins tomorrow. Make sure you know where to collect it.",
        context,
        eventKey: notificationEventKey("RENTAL_STARTING_SOON", rental.id, rental.startDate.toISOString().slice(0, 10)),
        emailTemplate: "RENTAL_REMINDER",
      });
    }

    if (rental.status === "ACTIVE") {
      // Just started. Keyed on the rental alone, so it is announced once ever.
      await notify(executor, {
        userId: rental.renterId,
        type: "RENTAL_ACTIVE",
        title: "Your rental has started",
        body: "Your rental is now active. The return date is on your rentals page.",
        context,
        eventKey: notificationEventKey("RENTAL_ACTIVE", rental.id),
      });

      // Due today or tomorrow. Keyed on the day, so a rental with a two-day warning
      // window can say it twice — once when it is "due tomorrow", once when it is
      // "due today" — and not once per page view.
      const endDate = rental.endDate.toISOString().slice(0, 10);
      const daysLeft = (endDate === today || endDate === addUtcDays(today, 1)) ? endDate : null;
      if (daysLeft) {
        await notify(executor, {
          userId: rental.renterId,
          type: "RENTAL_RETURN_DUE",
          title: "Your rental return is due soon",
          body:
            daysLeft === today
              ? "Your rental is due back today."
              : "Your rental is due back tomorrow.",
          context,
          eventKey: notificationEventKey("RENTAL_RETURN_DUE", rental.id, daysLeft),
          emailTemplate: "RENTAL_REMINDER",
        });
      }
    }

    // Late. Both parties, because the owner has a real problem here and the renter
    // has a real consequence. Keyed on the rental so it is said once, not once a day.
    if (rental.status === "OVERDUE") {
      const body = "A rental of your item is past its return date.";
      await notifyManyRental(executor, [
        { userId: rental.renterId, body: "One of your rentals is past its return date." },
        ...(rental.ownerId !== rental.renterId ? [{ userId: rental.ownerId, body }] : []),
      ], rental, context);
    }
  }
}

/** Fan out one rental's overdue notice to every party who is not the same person. */
async function notifyManyRental(
  executor: Pick<typeof db, "insert" | "select">,
  recipients: { userId: number; body: string }[],
  rental: { id: number },
  context: { rentalId: number; productId: number },
): Promise<void> {
  for (const recipient of recipients) {
    await notify(executor, {
      userId: recipient.userId,
      type: "RENTAL_OVERDUE",
      title: "Rental overdue",
      body: recipient.body,
      context,
      // Suffixed with the recipient so the *second* party's notice is not suppressed
      // by the first party's insert on a shared key.
      eventKey: notificationEventKey("RENTAL_OVERDUE", rental.id, recipient.userId),
      emailTemplate: "RENTAL_REMINDER",
    });
  }
}

/** `YYYY-MM-DD` for the day after an ISO date string, without touching the clock. */
function addUtcDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/* --------------------------------- timeline --------------------------------- */

export type RentalTimelineEvent = {
  key: string;
  label: string;
  description?: string;
  /** Null when the step has no recorded time. Never invented. */
  at: string | null;
  state: "done" | "current" | "pending" | "failed" | "cancelled";
};

export type RentalTimelineInput = {
  /** Recorded steps, from `rental_events`. */
  events: { type: string; createdAt: string }[];
  status: RentalStatus;
  /**
   * When the rental was created, used to show a confirmed step for rows that
   * predate the events table. It is a real timestamp, not a stand-in.
   */
  confirmedAt: string;
};

/**
 * Build the rental's history from the steps actually recorded in
 * `rental_events`.
 *
 * The rule is the same one the order timeline uses: a step gets a time **only**
 * when a real time exists for it.
 *
 * Two consequences of reading from events rather than from the current status:
 *
 *  - A step that has not been recorded is **omitted** when nothing before it
 *    happened, rather than shown as a permanent "waiting". `DELIVERY_COMPLETED`
 *    is the real example: no system here knows when a courier handed an item
 *    over, so it simply does not appear until a logistics integration writes it.
 *  - A step that comes *after* a recorded one and has not happened yet is shown
 *    as "waiting", because it is still ahead in the lifecycle.
 */
/**
 * Steps this app has no way to record, so they appear **only** if an event
 * exists. Anything here must not be rendered as "waiting": a permanent pending
 * step for something no system ever writes is a promise the timeline cannot keep.
 *
 * `DELIVERY_COMPLETED` needs a logistics integration that does not exist yet. The
 * type stays declared so that integration has a home.
 */
const RECORD_ONLY: ReadonlySet<string> = new Set(["DELIVERY_COMPLETED"]);

export function buildRentalTimeline({
  events,
  status,
  confirmedAt,
}: RentalTimelineInput): RentalTimelineEvent[] {
  const byType = new Map<string, string>();
  for (const event of events) {
    // First write wins: the unique index means there is only one, but a
    // defensive `has` keeps a malformed duplicate from moving a timestamp.
    if (!byType.has(event.type)) byType.set(event.type, event.createdAt);
  }

  // Rows created before the events table existed still have a real creation
  // time, so their confirmed step is shown rather than their history vanishing.
  if (!byType.has("CONFIRMED")) byType.set("CONFIRMED", confirmedAt);

  const timeline: RentalTimelineEvent[] = [];
  let seenDone = false;

  for (const type of EVENT_ORDER) {
    if (type === "CANCELLED") continue;
    const at = byType.get(type);
    if (at !== undefined) {
      timeline.push({ key: type, label: EVENT_LABELS[type], at, state: "done" });
      seenDone = true;
    } else if (seenDone && !RECORD_ONLY.has(type)) {
      timeline.push({ key: type, label: EVENT_LABELS[type], at: null, state: "pending" });
    }
  }

  if (status === "CANCELLED" || byType.has("CANCELLED")) {
    // Cancellation ends the story; nothing after it is still ahead of the
    // customer, so it is the last entry rather than the first.
    return [
      ...timeline.filter((event) => event.state === "done"),
      {
        key: "CANCELLED",
        label: EVENT_LABELS.CANCELLED,
        at: byType.get("CANCELLED") ?? null,
        state: "cancelled",
      },
    ];
  }

  return timeline;
}

/** Statuses a list filter may target, in tab order. */
export function statusesForBucket(bucket: RentalBucket): RentalStatus[] {
  switch (bucket) {
    case "upcoming":
      return ["CONFIRMED"];
    case "active":
      return IN_HAND_STATUSES;
    case "completed":
      return CLOSED_STATUSES;
    default:
      return [];
  }
}
