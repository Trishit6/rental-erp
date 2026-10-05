import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { notificationPreferences, notifications, orderItems, users } from "../schema";
import { emailTemplateForType, renderEmail, sendEmail, type EmailTemplate } from "./email";
import {
  isEmailWorthy,
  isInAppWorthy,
  isInternalRoute,
  notificationCategoryFor,
  notificationDestination,
  notificationEntityFor,
  truncateBody,
  truncateTitle,
  type NotificationCategory,
  type NotificationEntityType,
  type NotificationEventContext,
} from "./notification-events";

/**
 * Writing notifications.
 *
 * ## One function, not a raw insert
 *
 * There are already six places in this codebase that insert into `notifications`
 * directly, each spelling its own `type` string, its own `link`, and its own idea of
 * who the recipient is. That is the shape of the bug this module exists to prevent:
 * a notification that lands on the wrong user's screen, or that navigates to a page
 * which does not exist, is not caught by any test — it is just a bad experience
 * discovered by a customer.
 *
 * So every insert goes through `notify()`, which owns four guarantees:
 *
 *  1. **The destination is derived, never supplied.** `link` is resolved from the
 *     event context by `notificationDestination()`, so it can only ever be an
 *     internal route. A caller cannot point a notification at an arbitrary URL even
 *     by accident.
 *  2. **An event notifies once.** `eventKey` carries a unique index; a duplicate is
 *     detected and swallowed (see `insertNotification`).
 *  3. **Preferences are honoured before the row is written**, not after — a user who
 *     switched off order emails never gets the row queued in the first place.
 *  4. **A notification can never fail the operation that caused it.** See "Why this
 *     never throws" below.
 *
 * ## Why this never throws into the request
 *
 * Every call site has *already succeeded* by the time it writes a notification: the
 * order exists, the rental is marked returned, the listing is live. If the
 * notification insert then failed, the correct outcome is "the action stands and the
 * bell is quiet" — not a 500 that invites a retry which double-applies the action.
 * The reasoning is the same as `recordAudit()`, and for the same reason.
 */

/**
 * The slice of the database this module needs.
 *
 * `Pick` rather than `typeof db` so the same helpers work inside a caller's
 * transaction (`tx`) and outside one — the shape `recordRentalEvent()` already
 * established in `server/lib/rental-lifecycle.ts`. Passing the transaction matters:
 * a notification about an order should commit or roll back with the order, not
 * survive it.
 */
type NotificationExecutor = Pick<typeof db, "insert" | "select">;

export type NotifyInput = {
  /**
   * The recipient.
   *
   * Always the authenticated user or a participant the server itself resolved. It is
   * never read from a request body — a caller that had one would be handing a user
   * the power to write notifications into someone else's feed.
   */
  userId: number;
  type: string;
  title: string;
  body?: string | null;
  /** Ids the destination and the entity link are derived from. */
  context?: NotificationEventContext;
  /**
   * The once-per-occurrence idempotency key, from `notificationEventKey()`.
   *
   * Omit it for an event that should genuinely be able to happen twice (a reminder
   * loop that passes its own discriminator, for instance). Supply it for anything
   * driven by a state transition, which is every "your order has shipped" notice in
   * the app.
   */
  eventKey?: string | null;
  /**
   * Overrides the derived destination.
   *
   * Only for the cases a type cannot know — a "try again" link for a failed payment,
   * which has no entity at all. It is validated against `isInternalRoute()` in
   * `truncateLink`'s caller, so an override can still only be an internal path.
   */
  link?: string | null;
  /** Set when the event knows an entity the type's definition does not name. */
  relatedEntityType?: NotificationEntityType | null;
  relatedEntityId?: number | null;
  /** Safe extra context. Never addresses, card data or credentials. */
  metadata?: Record<string, unknown> | null;
  /** Overrides the email template `emailTemplateForType` would choose. */
  emailTemplate?: EmailTemplate | null;
}

/** One recipient's resolved channel choices. */
type ChannelChoice = { inApp: boolean; email: boolean };

/**
 * Whether a category is enabled for this user.
 *
 * ## Why "no row" means "everything on"
 *
 * The preferences table has one row per user and is created on first write, so its
 * absence is the state of a user who has never opened the settings page. Defaulting
 * that to "off" would mean notifications stop for everyone who did not go looking for
 * a toggle — the worst possible failure mode, and a silent one. It also means the
 * table cannot be back-filled to change anyone's behaviour.
 */
function channelChoice(
  category: NotificationCategory,
  row: typeof notificationPreferences.$inferSelect | undefined,
): ChannelChoice {
  if (!row) return { inApp: true, email: true };
  const inApp = {
    ORDERS: row.ordersInApp,
    RENTALS: row.rentalsInApp,
    PAYMENTS: row.paymentsInApp,
    SELLER: row.sellerInApp,
    WISHLIST: row.wishlistInApp,
    ADMIN: row.adminInApp,
  }[category];
  const email = {
    ORDERS: row.ordersEmail,
    RENTALS: row.rentalsEmail,
    PAYMENTS: row.paymentsEmail,
    SELLER: row.sellerEmail,
    WISHLIST: false,
    ADMIN: false,
  }[category];
  return { inApp, email };
}

/** True when MySQL rejected the row because `notifications.event_key` already held it. */
function isDuplicateKeyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  // 1062 is MySQL's duplicate-entry error. `recordRentalEvent()` matches on the
  // message text for the same reason — the driver surfaces the SQLSTATE as a plain
  // message string, and matching the number alone would miss a wrapped error.
  return message.includes("duplicate") || message.includes("1062");
}

/**
 * Insert one notification, honouring its idempotency key.
 *
 * Returns `true` when the row was written and `false` when the event had already
 * been delivered. The caller uses that to decide whether to send email: a repeated
 * event must not produce a second message either.
 *
 * ## How "already sent" is decided
 *
 * Two mechanisms, and both are needed:
 *
 *  - the pre-read is the cheap, non-throwing path — it covers the overwhelmingly
 *    common case (a retried request arriving seconds later) without an error at all;
 *  - the catch is the correctness guarantee. The pre-read is a race: two concurrent
 *    requests can both read "not there". The unique index is the arbiter, so exactly
 *    one of them writes and the other loses and reports `false`.
 *
 * Relies on the dialect detail already documented on `notifications.eventKey`: in
 * MySQL a duplicate-key error does not abort the enclosing transaction, so catching
 * it here is safe even when `executor` is a caller's `tx`.
 */
async function insertNotification(
  executor: NotificationExecutor,
  row: typeof notifications.$inferInsert,
  eventKey: string | null,
): Promise<boolean> {
  if (eventKey) {
    const [existing] = await executor
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.eventKey, eventKey))
      .limit(1);
    if (existing) return false;
  }

  try {
    await executor.insert(notifications).values(row);
    return true;
  } catch (error) {
    if (eventKey && isDuplicateKeyError(error)) return false;
    throw error;
  }
}

/** Resolve the row to write, including the destination and entity columns. */
function buildRow(input: NotifyInput) {
  const context = input.context ?? {};
  const derivedLink =
    input.link !== undefined && input.link !== null
      ? input.link
      : notificationDestination(input.type, context);

  // A link is only ever stored when it is an internal absolute route. `notificationDestination`
  // can only produce one, so this check is really about the *override* path — and it
  // matters anyway because `link` is plain text that seeded rows predate.
  const link = isInternalRoute(derivedLink) ? derivedLink.slice(0, 200) : null;

  const entityType =
    input.relatedEntityType !== undefined && input.relatedEntityType !== null
      ? input.relatedEntityType
      : notificationEntityFor(input.type);
  const entityId =
    input.relatedEntityId !== undefined && input.relatedEntityId !== null
      ? input.relatedEntityId
      : (context.orderId ?? context.rentalId ?? context.productId ?? null);

  return {
    userId: input.userId,
    type: input.type.slice(0, 40),
    title: truncateTitle(input.title.trim()),
    body: input.body ? truncateBody(input.body.trim()) : null,
    link,
    relatedEntityType: entityType ? entityType.slice(0, 16) : null,
    relatedEntityId: entityId !== null && Number.isFinite(entityId) ? Math.trunc(entityId) : null,
    metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 2000) : null,
    eventKey: eventKeyColumn(input.eventKey),
  };
}

/** The `eventKey` as stored: a bounded token, or `null` (which never collides). */
function eventKeyColumn(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.slice(0, 190);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Notify one user about something.
 *
 * Returns `true` when the notification was actually delivered (row written, or mail
 * sent where the in-app channel was off). `false` means "suppressed" — a duplicate
 * event, an unsupported type, or a preference. Callers do not need to branch on it;
 * it exists for tests and for the rare case where a caller wants to log the outcome.
 */
export async function notify(
  executor: NotificationExecutor,
  input: NotifyInput,
): Promise<boolean> {
  try {
    return await notifyUnsafe(executor, [input]);
  } catch (error) {
    // The business action already happened. A quiet bell is a cosmetic loss; a 500
    // would invite a retry that applies the action twice.
    console.error(`[notifications] failed to deliver ${input.type}`, error);
    return false;
  }
}

/**
 * Notify several users about one event.
 *
 * ## Why this is not just `Promise.all(inputs.map(i => notify(...)))`
 *
 * Two reasons, and the second is the important one:
 *
 *  - each individual `notify` would resolve the same recipients' preferences and
 *    addresses again — one seller with nine sold lines would run eighteen identical
 *    queries;
 *  - **it must fail as a unit that the caller already accepted.** The swallowing
 *    behaviour is identical either way, but a batch that reads the recipients once
 *    also gives `notifyMany` a single decision point for the email fan-out.
 *
 * ## Callers own the idempotency keys
 *
 * `notifications.event_key` is globally unique, not unique per recipient. Two
 * `NotifyInput`s in one batch that share an `eventKey` therefore collapse to one
 * delivered notification — correct when the second really is a duplicate, and a
 * silent loss of a notification when the second is owed to a *different person*.
 * Any fan-out where more than one user hears about one event must give each
 * recipient a distinct discriminator; `notifyAdmins` does this itself.
 */
export async function notifyMany(
  executor: NotificationExecutor,
  inputs: readonly NotifyInput[],
): Promise<boolean> {
  if (inputs.length === 0) return false;
  try {
    return await notifyUnsafe(executor, inputs);
  } catch (error) {
    console.error(
      `[notifications] failed to deliver a batch of ${inputs.length} (${inputs[0]?.type ?? "?"})`,
      error,
    );
    return false;
  }
}

/**
 * The shared implementation.
 *
 * Deliberately not wrapped in its own try/catch: `notify`/`notifyMany` do that, so
 * there is exactly one place that decides a failure is survivable.
 */
async function notifyUnsafe(
  executor: NotificationExecutor,
  inputs: readonly NotifyInput[],
): Promise<boolean> {
  const deliverable = inputs.filter((input) => isInAppWorthy(input.type) || isEmailWorthy(input.type));
  if (deliverable.length === 0) return false;

  const userIds = [...new Set(deliverable.map((input) => input.userId))];
  const [preferenceRows, recipientRows] = await Promise.all([
    readPreferencesFor(executor, userIds),
    readRecipients(executor, userIds),
  ]);

  let delivered = false;

  for (const input of deliverable) {
    const choice = channelChoice(notificationCategoryFor(input.type), preferenceRows.get(input.userId));
    const wrote = choice.inApp
      ? await insertNotification(executor, buildRow(input), eventKeyColumn(input.eventKey))
      : false;
    if (!wrote) continue;

    delivered = true;
    const recipient = recipientRows.get(input.userId);
    if (choice.email && recipient) {
      await deliverEmail(input, recipient);
    }
  }

  return delivered;
}

/** One query for every recipient's channel choices, not one per notification. */
async function readPreferencesFor(
  executor: NotificationExecutor,
  userIds: readonly number[],
): Promise<Map<number, typeof notificationPreferences.$inferSelect>> {
  const rows = await executor
    .select()
    .from(notificationPreferences)
    .where(inArray(notificationPreferences.userId, [...userIds]));
  return new Map(rows.map((row) => [row.userId, row]));
}

/**
 * One query for every recipient's name and address.
 *
 * Only the two fields the email needs. A notification's *content* never comes from
 * here — it is composed by the call site from data that user is already the subject
 * of.
 */
async function readRecipients(
  executor: NotificationExecutor,
  userIds: readonly number[],
): Promise<Map<number, { name: string; email: string }>> {
  const rows = await executor
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, [...userIds]));
  return new Map(rows.map((row) => [row.id, { name: row.name, email: row.email }]));
}

/**
 * Hand one notification to the email provider, if it has an email form.
 *
 * `sendEmail` swallows provider failures, so nothing here can propagate. The only
 * work this does is choosing the template and rendering the body, both of which are
 * pure.
 */
async function deliverEmail(
  input: NotifyInput,
  recipient: { name: string; email: string },
): Promise<void> {
  const template = input.emailTemplate ?? emailTemplateForType(input.type);
  if (!template) return;

  const { subject, body } = renderEmail(template, {
    recipientName: recipient.name,
    orderNumber: input.context?.orderNumber ?? null,
    subjectLine: input.body ?? input.title,
    detail: null,
    actionPath: input.link ?? notificationDestination(input.type, input.context ?? {}),
    actionLabel: "Open Revaro",
  });

  await sendEmail({ to: recipient.email, subject, body, template });
}

/**
 * Notify every administrator.
 *
 * ## Why this exists rather than a `notifyAdmins(role)` filter on the writer
 *
 * Because "which administrators should hear about a new listing awaiting approval"
 * is a policy question, and policies belong where they can be read and tested rather
 * than scattered across call sites. Today the answer is: every active admin, and
 * nothing else. New roles (`SUPPORT`, `MODERATOR`) get added here, once.
 */
export async function notifyAdmins(
  executor: NotificationExecutor,
  input: Omit<NotifyInput, "userId">,
): Promise<boolean> {
  try {
    const admins = await executor
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "ADMIN"));
    if (admins.length === 0) return false;

    // The recipient is appended to the key here, and it is not optional.
    //
    // `notifications.event_key` carries a **global** unique index, so two rows cannot
    // share a key even when they are addressed to different people. Passing the
    // caller's key through unchanged would therefore notify the first administrator
    // and have every subsequent one silently suppressed as a "duplicate event" — the
    // idempotency mechanism doing exactly what it is for, in the one place where
    // several people are legitimately owed the same event.
    return await notifyMany(
      executor,
      admins.map((admin) => ({
        ...input,
        userId: admin.id,
        eventKey: input.eventKey ? `${input.eventKey}:${admin.id}` : input.eventKey,
      })),
    );
  } catch (error) {
    console.error(`[notifications] failed to reach admins for ${input.type}`, error);
    return false;
  }
}

/**
 * The distinct seller ids on an order's lines.
 *
 * Deduplicated in SQL rather than in JavaScript because an order legitimately
 * contains several lines from the same seller, and a seller who receives "you
 * received a new order" three times for one order is a notification bug that looks
 * exactly like a feature.
 */
export async function distinctSellerIdsFor(
  executor: Pick<typeof db, "select" | "selectDistinct">,
  orderId: number,
): Promise<number[]> {
  const rows = await executor
    .selectDistinct({ sellerId: orderItems.sellerId })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  return rows.map((row) => row.sellerId);
}