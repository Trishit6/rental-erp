import { z } from "zod";
import { Router } from "../lib/http";
import { ok, HttpError } from "../lib/api";
import { requireUser } from "../lib/auth";
import {
  countUnread,
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  parseNotificationListQuery,
  readNotificationPreferences,
  setNotificationRead,
  writeNotificationPreferences,
} from "../lib/notification-queries";

/**
 * `GET|PATCH|DELETE /api/notifications`
 *
 * ## Every handler here is scoped by the session user
 *
 * `requireUser(c)` is registered as router-wide middleware, so `c.get("user")` is
 * populated for every path — including ones this router does not define, which is how
 * an unauthenticated call to a mistyped notification URL answers 401 instead of
 * leaking whether the path exists.
 *
 * The consequence that matters is on the *write* handlers: `setNotificationRead` and
 * `deleteNotification` both take `userId` from the session and scope their `WHERE` by
 * it. A notification id is therefore not a capability — there is no id that addresses
 * somebody else's notification, because the update simply does not match. That is
 * stronger than a read-then-check, and it is a single query rather than two.
 */
export const notificationsRoute = new Router();

notificationsRoute.use("*", async (c, next) => {
  requireUser(c);
  await next();
});

/**
 * `GET /api/notifications` — the feed.
 *
 * Paginated and filterable. The previous implementation returned a hard `.limit(50)`
 * with no filters and no total, which meant the bell could show ten of the fifty most
 * recent and there was no way to ask for an older one.
 */
notificationsRoute.get("/", async (c) => {
  const user = c.get("user")!;
  const query = parseNotificationListQuery(c.req.query());
  const page = await listNotifications(user.id, query);
  return c.json(ok(page));
});

/**
 * `GET /api/notifications/unread-count` — the badge's number, on its own.
 *
 * Exists so the header can refresh a number without re-reading the feed. The bell
 * badge is on every page of the app, and making it depend on a 20-row list response
 * would mean transferring, parsing and discarding twenty notifications on every
 * navigation just to render "3".
 */
notificationsRoute.get("/unread-count", async (c) => {
  const user = c.get("user")!;
  return c.json(ok({ unread: await countUnread(user.id) }));
});

/**
 * `GET /api/notifications/preferences` — effective channel settings.
 *
 * Registered before the `/:id{[0-9]+}` routes on purpose. The digit constraint already
 * keeps the two apart, so this is belt and braces rather than the thing that makes it
 * work — but it costs nothing and it means a future unconstrained parameter cannot
 * silently start answering for `/preferences`.
 */
notificationsRoute.get("/preferences", async (c) => {
  const user = c.get("user")!;
  return c.json(ok(await readNotificationPreferences(user.id)));
});

/**
 * Preferences write.
 *
 * `.strict()` and every group `.optional()`: a settings screen that saves the wishlist
 * group must not be able to reset a payments change, and a typo in a group name must
 * be a 400 rather than a silent no-op that reports success. The upsert in
 * `writeNotificationPreferences` only touches the columns actually present.
 */
const channelSchema = z
  .object({
    inApp: z.boolean().optional(),
    email: z.boolean().optional(),
  })
  .strict();

const preferencesSchema = z
  .object({
    orders: channelSchema.optional(),
    rentals: channelSchema.optional(),
    payments: channelSchema.optional(),
    seller: channelSchema.optional(),
    /** In-app only — there is no wishlist email, and offering one would be a lie. */
    wishlist: z.object({ inApp: z.boolean() }).strict().optional(),
    admin: z.object({ inApp: z.boolean() }).strict().optional(),
  })
  .strict();

notificationsRoute.patch("/preferences", async (c) => {
  const user = c.get("user")!;
  const input = preferencesSchema.parse(await c.req.json().catch(() => ({})));

  // `wishlist` and `admin` have no email channel. Accepting an `email` there would be
  // a value the server silently drops, which is the kind of setting that looks saved
  // and does nothing — so the schema above refuses it outright.
  return c.json(ok(await writeNotificationPreferences(user.id, input)));
});

/**
 * `POST /api/notifications/read-all`
 *
 * `POST` rather than `PATCH` on a collection, matching how the endpoint already
 * behaved, so the existing header call keeps working.
 */
notificationsRoute.post("/read-all", async (c) => {
  const user = c.get("user")!;
  const { updated } = await markAllNotificationsRead(user.id);
  return c.json(ok({ read: true, updated, unread: 0 }));
});

const readSchema = z.object({ read: z.boolean() }).strict().default({ read: true });

/**
 * `PATCH /api/notifications/:id/read` — mark one read or unread.
 *
 * Defaults to `read: true` so a body-less request (the common case, from the bell's
 * per-row control) does the obvious thing instead of failing validation. `read: false`
 * exists because a user who taps a notification by accident needs a way back, and a
 * system that only moves forward cannot offer one.
 */
notificationsRoute.patch("/:id{[0-9]+}/read", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const input = readSchema.parse(await c.req.json().catch(() => ({})));
  const result = await setNotificationRead(user.id, id, input.read);
  if (!result.updated) {
    throw new HttpError(404, "NOT_FOUND", "Notification not found.");
  }
  return c.json(ok({ id, isRead: input.read, unread: await countUnread(user.id) }));
});

/** `DELETE /api/notifications/:id` — dismiss one permanently. */
notificationsRoute.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const result = await deleteNotification(user.id, id);
  if (!result.deleted) {
    throw new HttpError(404, "NOT_FOUND", "Notification not found.");
  }
  return c.json(ok({ id, deleted: true, unread: await countUnread(user.id) }));
});