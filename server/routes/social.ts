import { Router } from "../lib/http";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { users } from "../schema";
import { HttpError, ok } from "../lib/api";
import { guarded } from "../lib/rate-limit";
import { applyProfileUpdate, requireUser, selfEditableProfileFields } from "../lib/auth";
import { blockUser, listBlockedUsers, unblockUser } from "../lib/blocks";
import { notify } from "../lib/notifications";

/**
 * `GET|PATCH /api/users/me`
 *
 * ## What moved out of this file
 *
 * Conversations and notifications used to live here alongside this route. They now have
 * their own files — `server/routes/messages.ts` and `server/routes/notifications.ts` —
 * because each grew past what a single `me` endpoint can share a file with, and because
 * the authorization rules they enforce (participant membership on a conversation,
 * per-user scoping on a notification) are the part of the system most worth being able
 * to read in isolation.
 *
 * No endpoint was renamed or removed in the move. The mounts in `server/index.ts` still
 * serve `/api/conversations` and `/api/notifications`; only the sub-router's paths
 * changed, because they were being double-prefixed (see `server/routes/messages.ts`).
 */
export const usersRoute = new Router();

usersRoute.get("/me", (c) => {
  const user = requireUser(c);
  return c.json(ok(user));
});

/**
 * `PATCH /api/users/me` — update the session user's own profile.
 *
 * ## Why `requireUser` is called again here even though nothing gates this router
 *
 * `usersRoute` has no `use("*")` middleware, so the session is only guaranteed to be
 * populated for handlers that ask for it. Calling `requireUser(c)` per handler is the
 * convention this file already used, and it means adding a handler here cannot
 * accidentally ship an unauthenticated endpoint by forgetting a middleware line.
 *
 * ## Why the actor is never a parameter
 *
 * `db.update(users).set(input).where(eq(users.id, user.id))` — the id comes from the
 * session, so a client cannot update another account by sending a different one. The
 * strict schema means `role`, `verified` and `passwordHash` are not reachable through
 * this endpoint at all, rather than being filtered out after parsing.
 */
usersRoute.patch("/me", guarded("auth.password", async (c) => {
  const user = requireUser(c);
  const input = selfEditableProfileFields.strict().parse(await c.req.json());

  // `updatedAt` is written by the helper rather than left to the column default,
  // because nothing sets it on update automatically and the notification key below
  // depends on it. A profile row whose `updatedAt` never moved would make every
  // subsequent edit collide on the same idempotency key and go unannounced.
  const updated = await applyProfileUpdate(user.id, input);

  // The server's conclusion, not the client's assertion: what actually changed is
  // echoed back so the profile screen can show it without re-deriving it.
  await notify(db, {
    userId: user.id,
    type: "PROFILE_UPDATED",
    title: "Profile updated",
    body: "Your Revaro profile details were changed.",
    relatedEntityType: "ACCOUNT",
    relatedEntityId: user.id,
    // Keyed on the row's own version rather than "now", so a double-submitted save
    // (which produces one `updatedAt`) cannot yield two "profile updated" rows.
    eventKey: `PROFILE_UPDATED:${user.id}:${updated.updatedAt.getTime()}`,
  });

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
}));

/* ------------------------------- blocking ----------------------------------- */

/**
 * `GET /api/users/blocked` — the accounts this user has blocked.
 *
 * Registered before the parameterised block routes below so the literal segment
 * `blocked` is never read as an id. It returns only the blocker's own rows and the
 * blocker's own note; the blocked account never learns of the relationship.
 */
usersRoute.get("/blocked", async (c) => {
  const user = requireUser(c);
  return c.json(ok(await listBlockedUsers(user.id)));
});

const blockParams = z.object({ id: z.coerce.number().int().positive() });

/**
 * The note is optional and private. `.strict()` so a body that tries to name the
 * blocker — the one field an attacker would want to control — is a 400 rather than
 * a silently ignored key.
 */
const blockBodySchema = z
  .object({ reason: z.string().trim().min(1, "A reason cannot be blank.").max(200).optional() })
  .strict();

/**
 * `POST /api/users/:id/block` — stop receiving this account's messages.
 *
 * Blocking is idempotent: blocking an already-blocked account succeeds and changes
 * nothing, so a double-tapped button is not an error. The target is verified to
 * exist so a bad id is a 404 rather than a foreign-key failure surfacing as a 500.
 */
usersRoute.post("/:id{[0-9]+}/block", guarded("social.block", async (c) => {
  const user = requireUser(c);
  const { id } = blockParams.parse(c.req.param());
  if (id === user.id) {
    throw new HttpError(400, "BAD_REQUEST", "You can't block yourself.");
  }

  const input = blockBodySchema.parse(await c.req.json().catch(() => ({})));

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
  if (!target) throw new HttpError(404, "NOT_FOUND", "That account does not exist.");

  await blockUser(user.id, id, input.reason ?? null);
  return c.json(ok({ id, blocked: true }));
}));

/**
 * `DELETE /api/users/:id/block` — lift the block.
 *
 * Succeeds whether or not a block was there: "make sure I am not blocking them" is
 * the request, and answering 404 to a state that already matches the intent would
 * make a retry after a dropped response look like a failure.
 */
usersRoute.delete("/:id{[0-9]+}/block", guarded("social.block", async (c) => {
  const user = requireUser(c);
  const { id } = blockParams.parse(c.req.param());
  await unblockUser(user.id, id);
  return c.json(ok({ id, blocked: false }));
}));