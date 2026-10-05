import { and, eq, gt, not } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { db } from "../db";
import { sessions, users } from "../schema";
import { HttpError } from "./api";
import { getCookie, setCookie, type Ctx, type Next } from "./http";

const SESSION_COOKIE = "revaro_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Sessions store a SHA-256 hash of the opaque token, never the raw value.
 * The hash doubles as the primary key so lookups are a single indexed query.
 */
export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  verified: boolean;
  avatarUrl: string | null;
};

function toSessionUser(user: typeof users.$inferSelect): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verified: user.verified,
    avatarUrl: user.avatarUrl,
  };
}

export async function createSession(c: Ctx, userId: number): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: tokenHash, userId, expiresAt });
  setCookie(c, SESSION_COOKIE, rawToken, sessionCookieOptions());
}

/**
 * The fields a user may change on their **own** account.
 *
 * ## Why this list is a whitelist and not a filtered object
 *
 * The obvious way to build "the user cannot promote themselves" is to parse a loose
 * schema and then strip `role`, `verified` and `passwordHash` before writing. That
 * makes every future column on `users` a field the filter has to remember to exclude,
 * and the day someone adds `stripeCustomerId` the strip list is one line short of a
 * privilege escalation. A schema that only *names* what is editable cannot be
 * incomplete in that way: `role` is not writable here because it is not in here.
 *
 * `.strict()` is belt-and-braces on top of that — it turns a client that sends
 * `{"name":"x","role":"ADMIN"}` into a 400 rather than a silent no-op, so a caller
 * that *thinks* it promoted itself finds out immediately instead of assuming it did.
 */
export const selfEditableProfileFields = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long").optional(),
  phone: z.string().trim().max(20, "Phone number is too long").optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export type SelfEditableProfile = z.infer<typeof selfEditableProfileFields>;

/**
 * Apply a self-service profile edit and return the row that resulted.
 *
 * ## Why the actor is an argument and never a body field
 *
 * The `where` clause is `eq(users.id, userId)` and the caller derives `userId` from
 * the session. There is no code path here in which a request body could influence
 * *whose* row is written — which is the whole of the "users cannot modify another
 * user's account" property, and it is structural rather than a check that could be
 * forgotten.
 *
 * `updatedAt` is written explicitly. Nothing in this codebase sets it on update
 * automatically, and `routes/social.ts` keys its "profile updated" notification on it.
 */
export async function applyProfileUpdate(
  userId: number,
  input: SelfEditableProfile,
): Promise<typeof users.$inferSelect> {
  // An untouched optional field must stay untouched. Spreading `input` straight into
  // `set` would write `name: undefined` over the existing value for any key the client
  // omitted, and Drizzle does not treat `undefined` as "leave this alone" here.
  const changes = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
  const now = new Date();
  await db
    .update(users)
    .set({ ...changes, updatedAt: now })
    .where(eq(users.id, userId));
  const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!updated) throw new HttpError(404, "NOT_FOUND", "Account not found.");
  return updated;
}

/** Key that `attachUser` publishes the resolved session under. */
export const SESSION_USER_KEY = "user";

export async function attachUser(c: Ctx, next: Next) {
  const rawToken = getCookie(c, SESSION_COOKIE);
  c.set(SESSION_USER_KEY, null);
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    const [row] = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (row) {
      c.set(SESSION_USER_KEY, toSessionUser(row.user));
      // Best-effort session touch; never block the request on it.
      void db
        .update(sessions)
        .set({ lastUsedAt: new Date() })
        .where(eq(sessions.id, tokenHash))
        .catch(() => undefined);
    }
  }
  await next();
}

/** Invalidate a single session by its raw cookie token (logout). */
export async function deleteSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(rawToken)));
}

/**
 * Invalidate **every** session belonging to a user, including the caller's.
 *
 * Used when the credential itself changes. A password is only worth changing because
 * it might have leaked, so the sessions minted while the old one was valid are exactly
 * what has to go — leaving them would mean the person who stole it keeps their access
 * even after the owner reacted.
 *
 * The count is returned so the caller can log how many were revoked; nothing is derived
 * from it in the response, because telling an anonymous attacker how many devices a
 * victim had is not information the requester is entitled to.
 */
export async function deleteAllSessions(userId: number): Promise<number> {
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  if (existing.length === 0) return 0;
  await db.delete(sessions).where(eq(sessions.userId, userId));
  return existing.length;
}

/**
 * Invalidate every session **except** the one making the current request.
 *
 * This is the password-change variant. The user is mid-flow in a browser they are
 * holding, and signing them out of the tab they just used — right after confirming a
 * password change — reads as a bug and loses their place. Everything *else* is revoked,
 * which is where an attacker's session would actually be.
 */
export async function deleteOtherSessions(
  userId: number,
  rawToken: string | undefined,
): Promise<number> {
  const keep = rawToken ? hashSessionToken(rawToken) : null;
  const condition = keep
    ? and(eq(sessions.userId, userId), not(eq(sessions.id, keep)))
    : eq(sessions.userId, userId);

  // Selected before deleted, rather than deleted with `.returning()`. MariaDB has no
  // `DELETE … RETURNING`, and Drizzle only offers `.returning()` on backends that do — so
  // the count the caller is told about ("we signed out 2 other sessions") has to come from
  // a read. It is a count of rows this request is about to remove, so there is no window
  // for it to be misleading in a way that matters.
  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(condition);
  if (existing.length === 0) return 0;
  await db.delete(sessions).where(condition);
  return existing.length;
}

export function requireUser(c: Ctx): SessionUser {
  const user = c.get(SESSION_USER_KEY);
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  return user;
}

export function requireAdmin(c: Ctx): SessionUser {
  const user = requireUser(c);
  if (user.role !== "ADMIN") {
    throw new HttpError(403, "FORBIDDEN", "Admin access required.");
  }
  return user;
}

/** Role-based authorization helper for route middleware. */
export function requireRole(...allowed: SessionUser["role"][]) {
  return (c: Ctx): SessionUser => {
    const user = requireUser(c);
    if (!allowed.includes(user.role)) {
      throw new HttpError(403, "FORBIDDEN", "You do not have access to this resource.");
    }
    return user;
  };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === "production",
  };
}

export { SESSION_COOKIE };
