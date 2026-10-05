import { Router } from "../lib/http";
import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { deleteCookie, getCookie } from "../lib/http";
import { db } from "../db";
import { users } from "../schema";
import { fail, ok, rateLimit, HttpError } from "../lib/api";
import {
  applyProfileUpdate,
  createSession,
  deleteOtherSessions,
  deleteSession,
  requireUser,
  selfEditableProfileFields,
  SESSION_COOKIE,
} from "../lib/auth";
import { BCRYPT_ROUNDS } from "../lib/config";
import { notificationEventKey } from "../lib/notification-events";
import { notify } from "../lib/notifications";

export const auth = new Router();

/**
 * Password rules, shared by registration and change.
 *
 * One definition, because the two flows must never disagree. A user who can register
 * with `abc12345` and is then refused `abc12345` as a *new* password is not being told
 * the rule — they are being told two different rules.
 */
const passwordRules = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(100, "Password is too long");

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: passwordRules,
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/**
 * Change-password payload.
 *
 * `currentPassword` is not optional. A change authenticated only by the session cookie
 * would let anyone who walks up to an unlocked, already-signed-in browser take the
 * account over permanently — the exact scenario a password change exists to close.
 *
 * `.strict()` rejects a `newPasswordConfirm` the way `users/me` rejects a `role`: the
 * confirmation is a form concern and is checked before the request is ever sent, so
 * accepting it here would imply a server-side check that does not exist.
 */
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordRules,
  })
  .strict();

export function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verified: user.verified,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    createdAt: user.createdAt,
  };
}

auth.use("/register", rateLimit(5, 60_000));
auth.use("/login", rateLimit(10, 60_000));
// Tight, because this is the endpoint a stolen session would hammer: each attempt
// costs a real bcrypt comparison, so the limiter is a genuine CPU brake here rather
// than just a politeness signal.
auth.use("/change-password", rateLimit(5, 60_000));

auth.post("/register", async (c) => {
  const input = registerSchema.parse(await c.req.json());
  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) {
    throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  // Registration always creates a plain USER — roles are never taken from the client.
  const [created] = await db
    .insert(users)
    .values({ name: input.name, email: input.email, passwordHash, role: "USER" })
    .$returningId();

  await createSession(c, created.id);
  const [user] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);

  // The first thing a new account should see, and the only notification anyone is
  // guaranteed to receive: it is written before any preference row exists, and a
  // missing row means "everything on" (see `channelChoice`).
  await notify(db, {
    userId: user.id,
    type: "ACCOUNT_WELCOME",
    title: `Welcome to Revaro, ${user.name.split(" ")[0]}`,
    body: "Your account is ready. Save an item you like and we will keep an eye on it for you.",
    // Keyed on the user, which is unique per account — registration is not retried by
    // a user, so the key only guards against a duplicate request racing itself.
    eventKey: notificationEventKey("ACCOUNT_WELCOME", user.id),
  });

  return c.json(ok(publicUser(user)), 201);
});

auth.post("/login", async (c) => {
  const input = loginSchema.parse(await c.req.json());
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    return c.json(fail("INVALID_CREDENTIALS", "Email or password is incorrect."), 401);
  }

  // Read the cookie *before* `createSession` overwrites it. A login that arrived
  // already carrying a session is a re-authentication (the client refreshing a stale
  // user, the profile form re-submitting) and says nothing about a new device.
  const hadSession = Boolean(getCookie(c, SESSION_COOKIE));

  await createSession(c, user.id);

  // A sign-in from a browser that was not already signed in is the one thing a user
  // cannot see happening — it happens on a device they may not be holding. Keyed on
  // the UTC date so a user whose password manager re-authenticates several times in
  // a session is told once, not once per request.
  if (!hadSession) {
    const today = new Date().toISOString().slice(0, 10);
    await notify(db, {
      userId: user.id,
      type: "LOGIN_NEW_DEVICE",
      title: "New sign-in",
      body: "Your account was just signed in to from a new browser or device. If this wasn't you, change your password.",
      eventKey: notificationEventKey("LOGIN_NEW_DEVICE", user.id, today),
    });
  }

  return c.json(ok(publicUser(user)));
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  await deleteSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json(ok({ loggedOut: true }));
});

/**
 * `POST /api/auth/change-password`
 *
 * ## What this does, in order
 *
 *  1. `requireUser` — the session cookie alone is not enough to reach this route.
 *  2. The **current** password is re-verified against the stored hash. Skipping this
 *     would make the endpoint a session-hijack escalator: anyone who stole a cookie
 *     could set a password and lock the real owner out permanently.
 *  3. The new password is hashed with the shared work factor and written.
 *  4. Every *other* session for that account is revoked.
 *
 * ## Why the current session survives
 *
 * Revoking everything, including the caller's own, would sign the user out of the tab
 * they are sitting in immediately after a successful change — which reads as a bug and
 * loses their place. The sessions worth revoking are the ones the account had
 * *elsewhere*, and those are exactly what step 4 removes. The change itself is announced
 * to the account's notification feed, so a session the user did not make is still visible
 * to them.
 *
 * ## Why the response says nothing about the old password
 *
 * It echoes the public user and a boolean. It never returns the new hash, the old hash,
 * or whether the new password happens to equal the old one — the last of those would be a
 * free oracle for testing a stolen password against the live account.
 */
auth.post("/change-password", async (c) => {
  const user = requireUser(c);
  const input = changePasswordSchema.parse(await c.req.json());

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Account not found.");

  if (!(await bcrypt.compare(input.currentPassword, row.passwordHash))) {
    // 401, not 403: the caller is authenticated, but the credential they supplied for
    // this specific action is wrong. The message names only the field that was wrong —
    // not which of "unknown account" or "wrong password" applies, which would let a
    // caller use this endpoint to discover registered emails.
    throw new HttpError(401, "WRONG_PASSWORD", "Your current password is incorrect.");
  }

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  const revokedSessions = await deleteOtherSessions(user.id, getCookie(c, SESSION_COOKIE));
  console.log(
    `[auth] password changed for user ${user.id}; ${revokedSessions} other session(s) revoked`,
  );

  await notify(db, {
    userId: user.id,
    type: "ACCOUNT_PASSWORD_CHANGED",
    title: "Your password was changed",
    body: revokedSessions > 0
      ? `We signed out ${revokedSessions} other session${revokedSessions === 1 ? "" : "s"} so nobody else keeps access. If this wasn't you, contact support.`
      : "If this wasn't you, contact support right away.",
    relatedEntityType: "ACCOUNT",
    relatedEntityId: user.id,
    // Keyed on the new hash: two real changes are two edits and must both be announced,
    // while a double-submitted form produces one hash and therefore one notification.
    eventKey: `ACCOUNT_PASSWORD_CHANGED:${user.id}:${passwordHash.slice(-16)}`,
  });

  return c.json(ok({ changed: true, revokedSessions }));
});

auth.get("/me", (c) => {
  const user = requireUser(c);
  return c.json(ok(user));
});

/**
 * `PATCH /api/auth/me`
 *
 * Kept because the client reads this shape, and pointed at the **same** helper
 * `routes/social.ts` uses for `PATCH /api/users/me`. The two were independent copies
 * that had already drifted: this one accepted any role-free object but skipped
 * `updatedAt`, wrote `undefined` over untouched columns, and could not clear an avatar
 * because its schema had no `null`. One implementation means a fix to profile editing
 * lands in both places.
 */
auth.patch("/me", async (c) => {
  const user = requireUser(c);
  const input = selfEditableProfileFields.strict().parse(await c.req.json());
  const updated = await applyProfileUpdate(user.id, input);
  return c.json(ok(publicUser(updated)));
});
